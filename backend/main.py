from datetime import datetime, timezone, timedelta
import re
import json
import sqlite3
import os
import hmac
import hashlib
import secrets
import socket
import ipaddress
import time
import uuid
from collections import deque
import urllib.request
import urllib.error
from urllib.parse import urlparse
from pathlib import Path
from io import BytesIO
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("NEXORA_DB_PATH", str(BASE_DIR / "nexora.db")))


APP_ENV = os.getenv("NEXORA_ENV", "development").strip().lower()
APP_SECRET = os.getenv("NEXORA_SECRET_KEY", "CHANGE_THIS_DEVELOPMENT_SECRET")
SESSION_HOURS = max(1, min(int(os.getenv("NEXORA_SESSION_HOURS", "12")), 168))
MAX_LOG_BYTES = 1_000_000
MAX_REQUEST_BYTES = 2_000_000
CORS_ORIGINS = [origin.strip().rstrip("/") for origin in os.getenv(
    "NEXORA_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",") if origin.strip()]

# Fail closed for production misconfiguration instead of silently starting insecurely.
if APP_ENV == "production":
    if APP_SECRET == "CHANGE_THIS_DEVELOPMENT_SECRET" or len(APP_SECRET) < 32:
        raise RuntimeError("NEXORA_SECRET_KEY must be a unique random value of at least 32 characters in production.")
    if not CORS_ORIGINS or "*" in CORS_ORIGINS or any(not origin.startswith("https://") for origin in CORS_ORIGINS):
        raise RuntimeError("Production NEXORA_CORS_ORIGINS must contain only explicit HTTPS frontend origins.")

app = FastAPI(title="Nexora AI API", version="1.6.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# Process-local abuse protection. Use an API gateway/shared limiter for multi-worker deployments.
_RATE_LIMITS = {
    "/api/auth/login": (10, 60),
    "/api/auth/register": (5, 3600),
    "/api/analyze-logs": (20, 60),
    "/api/alerts/evaluate": (30, 60),
}
_RATE_BUCKETS = {}

class IssueCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    system: str = Field(min_length=2, max_length=100)
    severity: str
    description: str = Field(min_length=3, max_length=5000)
    cause: str = Field(default="Not specified", max_length=5000)
    recommendation: str = Field(default="Review the issue and verify a safe fix.", max_length=5000)

class StatusUpdate(BaseModel):
    status: str

class LogAnalysisRequest(BaseModel):
    system: str = Field(default="Application Logs", min_length=2, max_length=100)
    logs: str = Field(min_length=1, max_length=1_000_000)

class IntegrationCreate(BaseModel):
    provider: str = Field(min_length=2, max_length=50)
    display_name: str = Field(min_length=2, max_length=100)
    endpoint_url: Optional[str] = Field(default=None, max_length=500)
    webhook_url: Optional[str] = Field(default=None, max_length=500)

class FixStatusUpdate(BaseModel):
    status: str
    rejection_reason: Optional[str] = Field(default=None, max_length=1000)

class SimulationConfirm(BaseModel):
    confirmation: str = Field(min_length=1, max_length=30)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    full_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)
    role: str = Field(default="Viewer")

class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)

class AdminUserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    full_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=10, max_length=128)
    role: str = Field(default="Viewer")


class UserActiveUpdate(BaseModel):
    is_active: bool


RULES = [
    ("Critical", "Memory exhaustion detected", r"out of memory|memoryerror|oom killed", "The process may have exhausted available memory.", "Inspect memory usage, identify leaks, and review resource limits before restarting services."),
    ("Critical", "Database connection failure", r"database.*connection.*(refused|failed)|connection refused.*database", "The application could not establish a database connection.", "Verify database availability, network access, credentials, and connection-pool limits."),
    ("Critical", "Critical system failure", r"fatal|critical|system crash", "A critical failure or crash was reported in the log.", "Inspect surrounding log entries and service health before applying a controlled recovery."),
    ("High", "API request timeout", r"timeout|timed out", "An operation exceeded its expected response time.", "Measure request duration and inspect slow dependencies, database queries, and timeout settings."),
    ("High", "Connection interruption", r"connection reset|connection lost|broken pipe", "A network or service connection was interrupted.", "Check network stability, service availability, and retry or timeout configuration."),
    ("High", "Permission or access failure", r"permission denied|access denied|unauthorized", "An operation was blocked by an access or permission restriction.", "Review authentication, authorization roles, file permissions, and secret configuration."),
    ("High", "Unhandled application exception", r"exception|traceback|unhandled error", "An exception or unhandled error was reported.", "Inspect the complete stack trace and reproduce the failure in a safe environment."),
    ("Medium", "Deprecated functionality warning", r"warning|deprecated", "The log reports a warning or deprecated functionality.", "Review the warning and plan a compatible update where required."),
    ("Medium", "Input validation failure", r"invalid input|validation error|bad request", "The application rejected or received invalid input.", "Review validation rules and test valid, invalid, and boundary-case inputs."),
]


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def log_activity(action: str, details: str, entity_type: str = "System", entity_id: Optional[int] = None):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO audit_logs (action, details, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (action, details, entity_type, entity_id, datetime.now(timezone.utc).isoformat()),
        )


def initialize_database():
    with get_connection() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            full_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Viewer',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS auth_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            system TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Open',
            description TEXT NOT NULL,
            cause TEXT NOT NULL,
            recommendation TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            details TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT 'System',
            entity_id INTEGER,
            created_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS integrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            display_name TEXT NOT NULL,
            endpoint_url TEXT,
            status TEXT NOT NULL DEFAULT 'Configured',
            created_at TEXT NOT NULL
        )""")
        # Phase 11: additive webhook delivery and observability metadata.
        integration_columns = {row[1] for row in conn.execute("PRAGMA table_info(integrations)").fetchall()}
        for column, definition in {
            "webhook_url": "TEXT",
            "webhook_enabled": "INTEGER NOT NULL DEFAULT 0",
        }.items():
            if column not in integration_columns:
                conn.execute(f"ALTER TABLE integrations ADD COLUMN {column} {definition}")
        conn.execute("""CREATE TABLE IF NOT EXISTS integration_deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            integration_id INTEGER NOT NULL,
            alert_id INTEGER,
            event_type TEXT NOT NULL,
            event_key TEXT NOT NULL,
            status TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            response_code INTEGER,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            delivered_at TEXT,
            UNIQUE(integration_id, event_key),
            FOREIGN KEY(integration_id) REFERENCES integrations(id) ON DELETE CASCADE
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_integration_deliveries_updated ON integration_deliveries(updated_at DESC)")
        conn.execute("""CREATE TABLE IF NOT EXISTS fix_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            rationale TEXT NOT NULL,
            before_text TEXT NOT NULL,
            after_text TEXT NOT NULL,
            steps TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Proposed',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(issue_id) REFERENCES issues(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS fix_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fix_id INTEGER NOT NULL,
            issue_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            actor_email TEXT NOT NULL,
            details TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(fix_id) REFERENCES fix_recommendations(id),
            FOREIGN KEY(issue_id) REFERENCES issues(id)
        )""")
        # Phase 10: additive maker-checker metadata and immutable workflow events.
        fix_columns = {row[1] for row in conn.execute("PRAGMA table_info(fix_recommendations)").fetchall()}
        for column, definition in {
            "created_by_email": "TEXT",
            "approved_by_email": "TEXT",
            "approved_at": "TEXT",
            "rejection_reason": "TEXT",
        }.items():
            if column not in fix_columns:
                conn.execute(f"ALTER TABLE fix_recommendations ADD COLUMN {column} {definition}")
        conn.execute("""CREATE TABLE IF NOT EXISTS fix_workflow_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fix_id INTEGER NOT NULL,
            actor_email TEXT NOT NULL,
            action TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT NOT NULL,
            details TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(fix_id) REFERENCES fix_recommendations(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS root_cause_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id INTEGER NOT NULL,
            probable_cause TEXT NOT NULL,
            evidence TEXT NOT NULL,
            impact TEXT NOT NULL,
            confidence TEXT NOT NULL,
            recommended_actions TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(issue_id) REFERENCES issues(id)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS alert_reads (
            issue_id INTEGER PRIMARY KEY,
            is_read INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(issue_id) REFERENCES issues(id)
        )""")
        # Phase 9: additive, idempotent alert workflow tables. Existing records are untouched.
        conn.execute("""CREATE TABLE IF NOT EXISTS alert_rules (
            rule_key TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS alert_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fingerprint TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL,
            source_id TEXT,
            title TEXT NOT NULL,
            system TEXT NOT NULL,
            severity TEXT NOT NULL,
            description TEXT NOT NULL,
            evidence_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'Open',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            acknowledged_by TEXT,
            acknowledged_at TEXT,
            resolved_at TEXT,
            resolution_reason TEXT
        )""")
        alert_event_columns = {row["name"] for row in conn.execute("PRAGMA table_info(alert_events)").fetchall()}
        if "resolution_reason" not in alert_event_columns:
            conn.execute("ALTER TABLE alert_events ADD COLUMN resolution_reason TEXT")
        rule_defaults = [
            ("critical_high_issues", "Critical and High issues", "Create one alert for each open Critical or High issue."),
            ("recurring_open_signatures", "Recurring open issue signatures", "Alert when two or more open issues share a normalized title and system."),
            ("rising_incident_volume", "Rising incident volume", "Alert when recent 7-day issue creation volume exceeds the preceding 7 days."),
        ]
        seed_time = datetime.now(timezone.utc).isoformat()
        conn.executemany(
            "INSERT OR IGNORE INTO alert_rules (rule_key, name, description, is_enabled, updated_at) VALUES (?, ?, ?, 1, ?)",
            [(key, name, description, seed_time) for key, name, description in rule_defaults],
        )
        count = conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0]
        if count == 0:
            samples = [
                ("API response timeout", "Backend / API", "Critical", "Open", "An API request takes too long to return a response.", "A slow database query, external service, or blocked operation may be responsible.", "Inspect application logs, measure request duration, and test the API dependency before changing production code."),
                ("Database connection warning", "Database", "High", "Open", "The application may be experiencing problems connecting to its database.", "Possible causes include incorrect connection settings, network problems, or an exhausted connection pool.", "Check database logs, connection settings, and connection-pool usage."),
                ("Invalid input validation", "Web Application", "Medium", "Open", "The application may accept data that does not match its expected format.", "A missing or incomplete validation rule could allow invalid input.", "Review validation rules and test valid, invalid, and unexpected values."),
                ("Repeated login failures", "Authentication", "High", "Approved", "Repeated failed login attempts have been reported in this sample dataset.", "Possible causes include incorrect credentials, expired sessions, or automated login attempts.", "Review authentication logs and apply appropriate account-protection controls."),
                ("Slow dashboard loading", "Frontend", "Medium", "Dismissed", "The dashboard takes longer than expected to render.", "Large assets, excessive network requests, or expensive rendering may contribute.", "Measure page performance before optimizing assets or changing rendering behavior."),
            ]
            conn.executemany("INSERT INTO issues (title, system, severity, status, description, cause, recommendation) VALUES (?, ?, ?, ?, ?, ?, ?)", samples)

        # Phase 12: safe indexes for frequently filtered operational queries.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_issue_created ON audit_logs(entity_type, action, entity_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_issues_status_severity ON issues(status, severity)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_events_status_severity ON alert_events(status, severity, updated_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)")

initialize_database()


def _password_digest(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000).hex()

def _token_digest(token: str) -> str:
    return hmac.new(APP_SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()

def _user_public(row):
    return {
        "id": row["id"], "email": row["email"], "full_name": row["full_name"],
        "role": row["role"], "is_active": bool(row["is_active"]),
        "created_at": row["created_at"]
    }

def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A valid Bearer token is required.")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="A valid Bearer token is required.")
    digest = _token_digest(token)
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        row = conn.execute("""
            SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
        """, (digest, now)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    return _user_public(row)

def require_roles(*roles):
    def checker(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Your account role cannot perform this action.")
        return user
    return checker

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = uuid.uuid4().hex
    started = time.perf_counter()
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                response = JSONResponse(status_code=413, content={"detail": "Request body exceeds the 2 MB limit."})
            else:
                response = None
        except ValueError:
            response = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
    else:
        response = None

    limit = _RATE_LIMITS.get(request.url.path) if request.method == "POST" else None
    if response is None and limit:
        max_requests, window_seconds = limit
        client_ip = request.client.host if request.client else "unknown"
        bucket_key = (client_ip, request.url.path)
        now = time.monotonic()
        bucket = _RATE_BUCKETS.setdefault(bucket_key, deque())
        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()
        if len(bucket) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            response = JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait before retrying."},
                headers={"Retry-After": str(retry_after)},
            )
        else:
            bucket.append(now)
        if len(_RATE_BUCKETS) > 5000:
            stale_before = now - 3600
            for key in list(_RATE_BUCKETS.keys()):
                entries = _RATE_BUCKETS[key]
                while entries and now - entries[0] >= 3600:
                    entries.popleft()
                if not entries or entries[0] < stale_before:
                    _RATE_BUCKETS.pop(key, None)

    if response is None:
        response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-ms"] = str(round((time.perf_counter() - started) * 1000, 2))
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

@app.get("/api/deployment/readiness")
def deployment_readiness():
    """Minimal deployment check; never returns secrets, filesystem paths, or environment values."""
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1").fetchone()
        database_ready = True
    except sqlite3.Error:
        database_ready = False
    secret_ready = APP_SECRET != "CHANGE_THIS_DEVELOPMENT_SECRET" and len(APP_SECRET) >= 32
    cors_ready = bool(CORS_ORIGINS) and "*" not in CORS_ORIGINS
    checks = {
        "database_reachable": database_ready,
        "application_secret_configured": secret_ready,
        "cors_origins_explicit": cors_ready,
        "production_transport_policy": APP_ENV != "production" or all(origin.startswith("https://") for origin in CORS_ORIGINS),
    }
    return {
        "status": "ready" if all(checks.values()) else "needs_configuration",
        "checks": checks,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "notes": [
            "Production requires a unique NEXORA_SECRET_KEY with at least 32 characters.",
            "Production CORS must list explicit HTTPS frontend origins.",
            "Terminate TLS at a trusted reverse proxy and use a shared rate limiter for multi-worker deployments.",
        ],
    }


@app.get("/api/system/overview")
def system_overview(user=Depends(require_roles("Admin", "Developer"))):
    """Return operational metadata for the Nexora dashboard; does not inspect external systems."""
    table_names = [
        "users", "issues", "integrations", "audit_logs",
        "fix_recommendations", "fix_executions", "fix_workflow_events", "root_cause_reports",
        "alert_reads", "alert_rules", "alert_events", "auth_sessions", "integration_deliveries",
    ]
    counts = {}
    with get_connection() as conn:
        for table in table_names:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] if exists else 0
        db_check = conn.execute("SELECT 1").fetchone()[0] == 1
    return {
        "application": "Nexora AI",
        "version": "1.6.1",
        "environment": APP_ENV,
        "database": {
            "connected": db_check,
            "file_exists": DB_PATH.exists(),
            "file_name": DB_PATH.name,
            "size_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        },
        "records": counts,
        "capabilities": {
            "rule_based_log_analysis": True,
            "root_cause_rules": True,
            "fix_execution": "simulation_only",
            "external_integrations": "outbound_webhooks_with_delivery_audit",
            "live_monitoring": False,
            "generative_ai": False,
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/system/reliability")
def system_reliability(user=Depends(require_roles("Admin", "Developer"))):
    """Return a transparent, data-derived reliability posture score, not an uptime claim."""
    now = datetime.now(timezone.utc)
    with get_connection() as conn:
        integrity_rows = conn.execute("PRAGMA quick_check").fetchall()
        integrity_messages = [str(row[0]) for row in integrity_rows]
        integrity_ok = bool(integrity_messages) and all(message.lower() == "ok" for message in integrity_messages)

        issue_rows = conn.execute(
            "SELECT id, severity, status FROM issues"
        ).fetchall()
        open_rows = [row for row in issue_rows if str(row["status"]).strip().lower() == "open"]
        severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Other": 0}
        for row in open_rows:
            severity = str(row["severity"]).strip().title()
            severity_counts[severity if severity in {"Critical", "High", "Medium"} else "Other"] += 1

        issue_ids = [int(row["id"]) for row in open_rows]
        created_at_by_issue = {}
        if issue_ids:
            placeholders = ",".join("?" for _ in issue_ids)
            events = conn.execute(
                f"SELECT entity_id, MIN(created_at) AS created_at FROM audit_logs "
                f"WHERE entity_type = 'Issue' AND action = 'Issue created' "
                f"AND entity_id IN ({placeholders}) GROUP BY entity_id",
                issue_ids,
            ).fetchall()
            created_at_by_issue = {int(row["entity_id"]): row["created_at"] for row in events if row["created_at"]}

    aged_over_7_days = 0
    known_age_count = 0
    unknown_age_count = 0
    for row in open_rows:
        created_value = created_at_by_issue.get(int(row["id"]))
        if not created_value:
            unknown_age_count += 1
            continue
        try:
            created = datetime.fromisoformat(str(created_value).replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            known_age_count += 1
            if now - created.astimezone(timezone.utc) > timedelta(days=7):
                aged_over_7_days += 1
        except (TypeError, ValueError):
            unknown_age_count += 1

    database_score = 100 if integrity_ok else 0
    incident_penalty = min(
        severity_counts["Critical"] * 25
        + severity_counts["High"] * 10
        + severity_counts["Medium"] * 4
        + severity_counts["Other"] * 2,
        100,
    )
    incident_score = 100 - incident_penalty
    aging_penalty = min(aged_over_7_days * 10, 100)
    aging_score = 100 - aging_penalty
    overall_score = round(database_score * 0.4 + incident_score * 0.4 + aging_score * 0.2)

    if overall_score >= 85:
        rating = "Healthy posture"
    elif overall_score >= 65:
        rating = "Needs attention"
    else:
        rating = "Elevated operational risk"

    findings = []
    if not integrity_ok:
        findings.append({"severity": "Critical", "title": "Database integrity check failed", "detail": "; ".join(integrity_messages)[:500] or "SQLite quick_check returned no result."})
    if severity_counts["Critical"]:
        findings.append({"severity": "Critical", "title": "Open critical incidents", "detail": f"{severity_counts['Critical']} critical issue(s) remain open."})
    if severity_counts["High"]:
        findings.append({"severity": "High", "title": "Open high-severity incidents", "detail": f"{severity_counts['High']} high-severity issue(s) remain open."})
    if aged_over_7_days:
        findings.append({"severity": "High", "title": "Aging open incidents", "detail": f"{aged_over_7_days} open issue(s) are older than seven days based on recorded creation events."})
    if unknown_age_count:
        findings.append({"severity": "Info", "title": "Incomplete incident age coverage", "detail": f"Creation time could not be verified for {unknown_age_count} open issue(s); these were excluded from the aging penalty."})
    if not findings:
        findings.append({"severity": "Info", "title": "No scored risk signals detected", "detail": "Database integrity passed and no scored open-incident risk signals were found in the available records."})

    return {
        "score": overall_score,
        "rating": rating,
        "checked_at": now.isoformat(),
        "dimensions": {
            "database_integrity": {"score": database_score, "weight_percent": 40, "status": "passed" if integrity_ok else "failed", "detail": "SQLite PRAGMA quick_check"},
            "incident_severity": {"score": incident_score, "weight_percent": 40, "status": "attention" if incident_penalty else "clear", "detail": "Open issue counts weighted by severity"},
            "incident_aging": {"score": aging_score, "weight_percent": 20, "status": "attention" if aged_over_7_days else "clear", "detail": "Open issues older than seven days; verified creation events only"},
        },
        "open_incidents": {"total": len(open_rows), "by_severity": severity_counts, "older_than_7_days": aged_over_7_days, "known_age": known_age_count, "unknown_age": unknown_age_count},
        "findings": findings,
        "methodology": {
            "weights": {"database_integrity": 40, "incident_severity": 40, "incident_aging": 20},
            "severity_penalties": {"Critical": 25, "High": 10, "Medium": 4, "Other": 2},
            "aging_penalty_per_issue_over_7_days": 10,
            "maximum_dimension_penalty": 100,
            "note": "This is a deterministic operational-risk indicator based on local SQLite and issue records. It is not uptime, latency, availability, SLA compliance, or live infrastructure monitoring. Issues without verified creation audit events are excluded from aging penalties.",
        },
    }


@app.get("/api/system/database-backup")
def download_database_backup(user=Depends(require_roles("Admin"))):
    """Download a consistent SQLite snapshot. This does not modify the live database."""
    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="Database file was not found.")
    snapshot = sqlite3.connect(":memory:")
    try:
        source = sqlite3.connect(DB_PATH)
        try:
            source.backup(snapshot)
        finally:
            source.close()
        output = BytesIO(snapshot.serialize())
        output.seek(0)
    finally:
        snapshot.close()
    log_activity("DATABASE_BACKUP_DOWNLOADED", f"Admin {user['email']} downloaded a SQLite backup.")
    headers = {"Content-Disposition": 'attachment; filename="nexora-backup.db"'}
    return StreamingResponse(output, media_type="application/octet-stream", headers=headers)

@app.post("/api/auth/register")
def register_user(payload: RegisterRequest):
    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if payload.role not in {"Admin", "Developer", "Viewer"}:
        raise HTTPException(status_code=400, detail="Role must be Admin, Developer, or Viewer.")

    # BEGIN IMMEDIATE serializes concurrent bootstrap attempts so only one first Admin can exist.
    salt = secrets.token_hex(16)
    digest = _password_digest(payload.password, salt)
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc).isoformat()
    expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat()
    try:
        with get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if count > 0:
                raise HTTPException(status_code=403, detail="Self-registration is closed after the first account. Ask an administrator to provision accounts.")
            cursor = conn.execute(
                "INSERT INTO users (email, full_name, password_hash, password_salt, role, is_active, created_at) VALUES (?, ?, ?, ?, 'Admin', 1, ?)",
                (email, payload.full_name.strip(), digest, salt, now),
            )
            user_id = cursor.lastrowid
            conn.execute(
                "INSERT INTO auth_sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (user_id, _token_digest(token), expires, now),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    log_activity("Administrator account created", f"Initial administrator account was created for {email}.", "User", user_id)
    return {"access_token": token, "token_type": "bearer", "expires_at": expires, "user": _user_public(row)}

@app.post("/api/auth/login")
def login(payload: LoginRequest):
    email = payload.email.strip().lower()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ? AND is_active = 1", (email,)).fetchone()
    if row is None or not hmac.compare_digest(_password_digest(payload.password, row["password_salt"]), row["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc).isoformat()
    expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat()
    with get_connection() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now,))
        conn.execute("INSERT INTO auth_sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
                     (row["id"], _token_digest(token), expires, now))
    log_activity("User login", f"{email} signed in.", "User", row["id"])
    return {"access_token": token, "token_type": "bearer", "expires_at": expires, "user": _user_public(row)}

@app.get("/api/auth/me")
def auth_me(user=Depends(get_current_user)):
    return user

@app.post("/api/auth/logout")
def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="A valid Bearer token is required.")
    digest = _token_digest(auth[7:].strip())
    with get_connection() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (digest,))
    return {"message": "Logged out successfully."}

@app.post("/api/auth/users")
def create_managed_user(payload: AdminUserCreate, admin=Depends(require_roles("Admin"))):
    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if payload.role not in {"Admin", "Developer", "Viewer"}:
        raise HTTPException(status_code=400, detail="Role must be Admin, Developer, or Viewer.")
    salt = secrets.token_hex(16)
    digest = _password_digest(payload.password, salt)
    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO users (email, full_name, password_hash, password_salt, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
                (email, payload.full_name.strip(), digest, salt, payload.role, now)
            )
            user_id = cursor.lastrowid
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    log_activity("User account created", f"Administrator created {email} with role {payload.role}.", "User", user_id)
    return _user_public(row)

@app.get("/api/auth/users")
def list_users(user=Depends(require_roles("Admin"))):
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY id").fetchall()
    return [_user_public(row) for row in rows]

@app.patch("/api/auth/users/{user_id}/role")
def change_user_role(user_id: int, role: str, user=Depends(require_roles("Admin"))):
    if role not in {"Admin", "Developer", "Viewer"}:
        raise HTTPException(status_code=400, detail="Role must be Admin, Developer, or Viewer.")
    with get_connection() as conn:
        target = conn.execute(
            "SELECT id, email, role, is_active FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="User not found.")
        if user_id == user["id"] and role != "Admin":
            raise HTTPException(status_code=400, detail="You cannot remove your own administrator role.")
        if target["role"] == "Admin" and target["is_active"] and role != "Admin":
            active_admins = conn.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'Admin' AND is_active = 1"
            ).fetchone()[0]
            if active_admins <= 1:
                raise HTTPException(status_code=409, detail="The last active administrator cannot be demoted.")
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    log_activity("User role changed", f"Administrator changed {target['email']} role to {role}.", "User", user_id)
    return {"message": "User role updated.", "user_id": user_id, "role": role}


@app.patch("/api/auth/users/{user_id}/status")
def change_user_status(user_id: int, payload: UserActiveUpdate, user=Depends(require_roles("Admin"))):
    with get_connection() as conn:
        target = conn.execute(
            "SELECT id, email, role, is_active FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="User not found.")
        if user_id == user["id"] and not payload.is_active:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
        if target["role"] == "Admin" and target["is_active"] and not payload.is_active:
            active_admins = conn.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'Admin' AND is_active = 1"
            ).fetchone()[0]
            if active_admins <= 1:
                raise HTTPException(status_code=409, detail="The last active administrator cannot be deactivated.")
        conn.execute("UPDATE users SET is_active = ? WHERE id = ?", (int(payload.is_active), user_id))
        if not payload.is_active:
            conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
    action = "User account activated" if payload.is_active else "User account deactivated"
    log_activity(action, f"Administrator changed {target['email']} account status to {'active' if payload.is_active else 'inactive'}.", "User", user_id)
    return {"message": "User status updated.", "user_id": user_id, "is_active": payload.is_active}



def issue_dict(row):
    return dict(row)

@app.get("/")
def root():
    return {"message": "Nexora AI API is running", "version": "1.6.1"}

@app.get("/health")
def health():
    """Report healthy only when the configured SQLite database is reachable."""
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1").fetchone()
    except sqlite3.Error:
        raise HTTPException(status_code=503, detail="Database is unavailable.")
    return {"status": "healthy", "database": "connected"}

@app.get("/api/issues")
def get_issues(user=Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM issues ORDER BY id DESC").fetchall()
    return [issue_dict(row) for row in rows]


@app.get("/api/issues/{issue_id}/history")
def get_issue_history(issue_id: int, user=Depends(get_current_user)):
    """Return retained audit events for one issue in chronological order."""
    with get_connection() as conn:
        issue = conn.execute("SELECT id, title FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if issue is None:
            raise HTTPException(status_code=404, detail="Issue not found.")
        rows = conn.execute(
            "SELECT id, action, details, entity_type, entity_id, created_at "
            "FROM audit_logs WHERE entity_type = 'Issue' AND entity_id = ? "
            "ORDER BY id DESC LIMIT 201",
            (issue_id,),
        ).fetchall()

    truncated = len(rows) > 200
    events = [dict(row) for row in rows[:200]]
    events.reverse()
    return {
        "issue_id": issue_id,
        "issue_title": issue["title"],
        "events": events,
        "total_returned": len(events),
        "truncated": truncated,
        "coverage_note": (
            "Shows retained audit events explicitly linked to this issue. "
            "Events not recorded in the audit log, older deleted records, and actions linked to other entity types are not represented."
        ),
    }

@app.post("/api/issues")
def create_issue(issue: IssueCreate, user=Depends(require_roles("Admin", "Developer"))):
    if issue.severity not in {"Critical", "High", "Medium"}:
        raise HTTPException(status_code=400, detail="Severity must be Critical, High, or Medium.")
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO issues (title, system, severity, status, description, cause, recommendation) VALUES (?, ?, ?, 'Open', ?, ?, ?)",
            (issue.title, issue.system, issue.severity, issue.description, issue.cause, issue.recommendation),
        )
        row = conn.execute("SELECT * FROM issues WHERE id = ?", (cursor.lastrowid,)).fetchone()
    created = issue_dict(row)
    log_activity("Issue created", f"Issue #{created['id']} — {created['title']} was created.", "Issue", created["id"])
    return {"message": "Issue created successfully", "issue": created}

@app.patch("/api/issues/{issue_id}")
def update_issue(issue_id: int, update: StatusUpdate, user=Depends(require_roles("Admin", "Developer"))):
    if update.status not in {"Open", "Approved", "Dismissed"}:
        raise HTTPException(status_code=400, detail="Invalid issue status.")
    with get_connection() as conn:
        existing = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Issue not found.")
        old_status = existing["status"]
        conn.execute("UPDATE issues SET status = ? WHERE id = ?", (update.status, issue_id))
        row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    updated = issue_dict(row)
    if old_status != update.status:
        log_activity(f"Issue {update.status.lower()}", f"Issue #{issue_id} — {updated['title']} changed from {old_status} to {update.status}.", "Issue", issue_id)
    return {"message": "Issue updated successfully", "issue": updated}

LOG_LEVEL_PATTERN = re.compile(r"\b(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\b", re.IGNORECASE)
LOG_TIMESTAMP_PATTERN = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}[T ][0-2]\d:[0-5]\d:[0-6]\d(?:\.\d+)?(?:Z|[+-][0-2]\d:?\d{2})?|"
    r"\d{4}/\d{2}/\d{2} [0-2]\d:[0-5]\d:[0-6]\d|"
    r"[A-Z][a-z]{2}\s+\d{1,2}\s+[0-2]\d:[0-5]\d:[0-6]\d)\b"
)
SECRET_PATTERNS = [
    (re.compile(r"(?i)(\b(?:password|passwd|pwd|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)\b\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}"), r"\1[REDACTED]"),
    (re.compile(r"(?i)([?&](?:token|key|password|secret|access_token)=)[^&\s]+"), r"\1[REDACTED]"),
]


def redact_log_line(line: str) -> str:
    redacted = line
    for pattern, replacement in SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted[:1000]


def parse_log_metadata(line: str) -> dict:
    level_match = LOG_LEVEL_PATTERN.search(line)
    timestamp_match = LOG_TIMESTAMP_PATTERN.search(line)
    return {
        "level": level_match.group(1).upper().replace("WARNING", "WARN") if level_match else "UNKNOWN",
        "timestamp": timestamp_match.group(0) if timestamp_match else None,
    }


def _severity_rank(value: str) -> int:
    return {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}.get(value, 0)


@app.post("/api/analyze-logs")
def analyze_logs(request: LogAnalysisRequest, user=Depends(require_roles("Admin", "Developer"))):
    lines = request.logs.splitlines()
    nonempty_lines = [(number, line) for number, line in enumerate(lines, start=1) if line.strip()]
    detected = []
    diagnostics = []
    severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    category_counts = {}

    processed_lines = 0
    truncated = False
    for line_index, (line_number, raw_line) in enumerate(nonempty_lines):
        processed_lines += 1
        matches = []
        for severity, title, pattern, cause, recommendation in RULES:
            match = re.search(pattern, raw_line, re.IGNORECASE)
            if match:
                matches.append((severity, title, cause, recommendation, match.group(0)))
        if not matches:
            continue
        # Keep one issue per source line, selecting the strongest matching rule.
        matches.sort(key=lambda item: _severity_rank(item[0]), reverse=True)
        severity, title, cause, recommendation, matched_text = matches[0]
        category, _, _, _, _, confidence = classify_issue({
            "title": title, "description": raw_line, "cause": cause,
            "recommendation": recommendation,
        })
        safe_line = redact_log_line(raw_line)
        metadata = parse_log_metadata(raw_line)
        detected.append({
            "title": title,
            "system": request.system,
            "severity": severity,
            "description": f"Line {line_number}: {safe_line}",
            "cause": cause,
            "recommendation": recommendation,
        })
        diagnostics.append({
            "line_number": line_number,
            "level": metadata["level"],
            "timestamp": metadata["timestamp"],
            "category": category,
            "matched_rule": title,
            "matched_text": matched_text[:160],
            "evidence": safe_line,
            "confidence": confidence,
            "additional_matches": [item[1] for item in matches[1:]],
        })
        severity_counts[severity] = severity_counts.get(severity, 0) + 1
        category_counts[category] = category_counts.get(category, 0) + 1
        if len(detected) >= 50:
            truncated = line_index < len(nonempty_lines) - 1
            break

    saved = []
    with get_connection() as conn:
        for item in detected:
            cursor = conn.execute(
                "INSERT INTO issues (title, system, severity, status, description, cause, recommendation) VALUES (?, ?, ?, 'Open', ?, ?, ?)",
                (item["title"], item["system"], item["severity"], item["description"], item["cause"], item["recommendation"]),
            )
            row = conn.execute("SELECT * FROM issues WHERE id = ?", (cursor.lastrowid,)).fetchone()
            saved.append(issue_dict(row))

    for diagnostic, issue in zip(diagnostics, saved):
        diagnostic["issue_id"] = issue["id"]

    log_activity(
        "Log analysis completed",
        f"Analyzed {len(nonempty_lines)} non-empty log line(s) for {request.system}; detected and saved {len(saved)} issue(s).",
        "Log Analysis", None,
    )
    return {
        "message": "Log analysis completed",
        "analysis_type": "deterministic-rule-based",
        "total_lines": len(lines),
        "nonempty_lines": len(nonempty_lines),
        "matched_lines": len(detected),
        "unmatched_lines": max(0, processed_lines - len(detected)),
        "unprocessed_lines": max(0, len(nonempty_lines) - processed_lines),
        "truncated": truncated,
        "total_detected": len(detected),
        "total_saved": len(saved),
        "severity_counts": severity_counts,
        "category_counts": category_counts,
        "diagnostics": diagnostics,
        "issues": saved,
    }

@app.get("/api/audit-logs")
def get_audit_logs(limit: int = 200, user=Depends(get_current_user)):
    limit = max(1, min(limit, 500))
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/integrations")
def get_integrations(user=Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute("""SELECT i.*,
            (SELECT COUNT(*) FROM integration_deliveries d WHERE d.integration_id=i.id) AS delivery_count,
            (SELECT MAX(delivered_at) FROM integration_deliveries d WHERE d.integration_id=i.id AND d.status='Delivered') AS last_success_at
            FROM integrations i ORDER BY i.id DESC""").fetchall()
    return [{**dict(row), "webhook_enabled": bool(row["webhook_enabled"])} for row in rows]


def validate_webhook_url(value: str) -> str:
    """Restrict outbound webhooks to public HTTPS destinations to reduce SSRF risk."""
    try:
        parsed = urlparse((value or "").strip())
        parsed_port = parsed.port
    except ValueError:
        raise HTTPException(status_code=400, detail="Webhook URL is malformed.")
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Webhook URL must be an HTTPS URL without embedded credentials.")
    if parsed_port not in (None, 443):
        raise HTTPException(status_code=400, detail="Webhook URLs may use only the standard HTTPS port (443).")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise HTTPException(status_code=400, detail="Webhook host must resolve only to public IP addresses.")
    except (socket.gaierror, ValueError):
        raise HTTPException(status_code=400, detail="Webhook hostname could not be resolved safely.")
    return value.strip()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _send_webhook(url: str, payload: dict, event_key: str) -> tuple[bool, Optional[int], Optional[str]]:
    if len(APP_SECRET) < 32 or APP_SECRET == "CHANGE_THIS_DEVELOPMENT_SECRET":
        return False, None, "NEXORA_SECRET_KEY must be configured with at least 32 characters before webhook delivery."
    try:
        # Revalidate DNS on every attempt; redirect following is deliberately disabled.
        validate_webhook_url(url)
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        signature = hmac.new(APP_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
        request = urllib.request.Request(url, data=body, headers={
            "Content-Type": "application/json",
            "User-Agent": "NexoraAI-Webhook/1.0",
            "X-Nexora-Event": payload.get("event", "alert.created"),
            "X-Nexora-Delivery": event_key,
            "X-Nexora-Signature-256": f"sha256={signature}",
        }, method="POST")
        opener = urllib.request.build_opener(_NoRedirect())
        with opener.open(request, timeout=5) as response:
            code = response.getcode()
            if 200 <= code < 300:
                return True, code, None
            return False, code, f"Webhook returned HTTP {code}."
    except urllib.error.HTTPError as exc:
        return False, exc.code, f"Webhook returned HTTP {exc.code}."
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, HTTPException) as exc:
        detail = getattr(exc, "detail", None) or str(exc) or exc.__class__.__name__
        return False, None, detail[:500]


def deliver_alert_webhooks(alert_row) -> None:
    """Deliver one newly-created alert to enabled webhook integrations with bounded retries."""
    alert = dict(alert_row)
    with get_connection() as conn:
        integrations = conn.execute("SELECT id, display_name, webhook_url FROM integrations WHERE webhook_enabled=1 AND webhook_url IS NOT NULL").fetchall()
    for integration in integrations:
        event_key = f"alert.created:{alert['id']}"
        now = datetime.now(timezone.utc).isoformat()
        with get_connection() as conn:
            conn.execute("""INSERT OR IGNORE INTO integration_deliveries
                (integration_id, alert_id, event_type, event_key, status, attempt_count, created_at, updated_at)
                VALUES (?, ?, 'alert.created', ?, 'Pending', 0, ?, ?)""",
                (integration["id"], alert["id"], event_key, now, now))
            delivery = conn.execute("SELECT * FROM integration_deliveries WHERE integration_id=? AND event_key=?", (integration["id"], event_key)).fetchone()
            if delivery["status"] == "Delivered":
                continue
        try:
            evidence = json.loads(alert.get("evidence_json") or "[]")
        except (TypeError, ValueError):
            evidence = []
        payload = {
            "event": "alert.created", "delivery_id": event_key,
            "occurred_at": alert["created_at"],
            "alert": {"id": alert["id"], "title": alert["title"], "system": alert["system"],
                      "severity": alert["severity"], "description": alert["description"],
                      "status": alert["status"], "source_type": alert["source_type"],
                      "source_id": alert["source_id"], "evidence": evidence},
        }
        success, response_code, error_message = False, None, None
        attempts = 0
        for attempt in range(1, 4):
            attempts = attempt
            success, response_code, error_message = _send_webhook(integration["webhook_url"], payload, event_key)
            if success:
                break
            if attempt < 3:
                time.sleep(0.2 * attempt)
        finished = datetime.now(timezone.utc).isoformat()
        with get_connection() as conn:
            conn.execute("""UPDATE integration_deliveries SET status=?, attempt_count=?, response_code=?,
                error_message=?, updated_at=?, delivered_at=? WHERE integration_id=? AND event_key=?""",
                ("Delivered" if success else "Failed", attempts, response_code, error_message, finished,
                 finished if success else None, integration["id"], event_key))
            conn.execute("DELETE FROM integration_deliveries WHERE id NOT IN (SELECT id FROM integration_deliveries ORDER BY id DESC LIMIT 5000)")


@app.post("/api/integrations")
def create_integration(integration: IntegrationCreate, admin=Depends(require_roles("Admin"))):
    allowed = {"GitHub", "GitLab", "Application API", "Business System"}
    if integration.provider not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported integration provider.")
    endpoint = (integration.endpoint_url or "").strip() or None
    if endpoint and not endpoint.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="Endpoint URL must start with http:// or https://.")
    webhook_url = validate_webhook_url(integration.webhook_url) if integration.webhook_url else None
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO integrations (provider, display_name, endpoint_url, webhook_url, webhook_enabled, status, created_at) VALUES (?, ?, ?, ?, ?, 'Configured', ?)",
            (integration.provider, integration.display_name.strip(), endpoint, webhook_url, 1 if webhook_url else 0, datetime.now(timezone.utc).isoformat()),
        )
        row = conn.execute("SELECT * FROM integrations WHERE id = ?", (cursor.lastrowid,)).fetchone()
    item = dict(row)
    item["webhook_enabled"] = bool(item["webhook_enabled"])
    log_activity("Integration configured", f"{item['display_name']} ({item['provider']}) was registered; webhook delivery {'enabled' if webhook_url else 'not configured'}.", "Integration", item["id"])
    return {"message": "Integration configuration saved", "integration": item}


class IntegrationWebhookUpdate(BaseModel):
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    enabled: bool = True


@app.patch("/api/integrations/{integration_id}/webhook")
def update_integration_webhook(integration_id: int, payload: IntegrationWebhookUpdate, admin=Depends(require_roles("Admin"))):
    webhook_url = validate_webhook_url(payload.webhook_url) if payload.webhook_url else None
    if payload.enabled and not webhook_url:
        raise HTTPException(status_code=400, detail="An HTTPS webhook URL is required when enabling delivery.")
    with get_connection() as conn:
        row = conn.execute("SELECT id, display_name FROM integrations WHERE id=?", (integration_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Integration not found.")
        conn.execute("UPDATE integrations SET webhook_url=?, webhook_enabled=? WHERE id=?",
                     (webhook_url, 1 if payload.enabled and webhook_url else 0, integration_id))
    log_activity("Integration webhook updated", f"Webhook delivery for {row['display_name']} {'enabled' if payload.enabled and webhook_url else 'disabled'}.", "Integration", integration_id)
    return {"message": "Webhook configuration updated", "webhook_enabled": bool(payload.enabled and webhook_url)}


@app.post("/api/integrations/{integration_id}/test")
def test_integration_webhook(integration_id: int, admin=Depends(require_roles("Admin"))):
    with get_connection() as conn:
        row = conn.execute("SELECT id, display_name, webhook_url, webhook_enabled FROM integrations WHERE id=?", (integration_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found.")
    if not row["webhook_enabled"] or not row["webhook_url"]:
        raise HTTPException(status_code=409, detail="Configure and enable a webhook before testing delivery.")
    event_key = f"webhook.test:{integration_id}:{secrets.token_hex(8)}"
    payload = {"event": "webhook.test", "delivery_id": event_key,
               "occurred_at": datetime.now(timezone.utc).isoformat(),
               "integration": {"id": integration_id, "display_name": row["display_name"]},
               "message": "NEXORA AI webhook connectivity test."}
    success, response_code, error_message = _send_webhook(row["webhook_url"], payload, event_key)
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute("""INSERT INTO integration_deliveries
            (integration_id, alert_id, event_type, event_key, status, attempt_count, response_code, error_message, created_at, updated_at, delivered_at)
            VALUES (?, NULL, 'webhook.test', ?, ?, 1, ?, ?, ?, ?, ?)""",
            (integration_id, event_key, "Delivered" if success else "Failed", response_code, error_message, now, now, now if success else None))
    log_activity("Webhook test delivered" if success else "Webhook test failed",
                 f"Webhook test for {row['display_name']}: {'HTTP ' + str(response_code) if success else (error_message or 'delivery failed')}.", "Integration", integration_id)
    if not success:
        raise HTTPException(status_code=502, detail=f"Webhook delivery failed: {error_message or 'no successful response'}")
    return {"message": "Webhook test delivered successfully", "response_code": response_code}


@app.get("/api/integrations/observability")
def integration_observability(user=Depends(get_current_user)):
    with get_connection() as conn:
        totals = conn.execute("""SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='Delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status='Failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending
            FROM integration_deliveries""").fetchone()
        rows = conn.execute("""SELECT d.id, d.integration_id, i.display_name, d.alert_id, d.event_type,
            d.status, d.attempt_count, d.response_code, d.error_message, d.created_at, d.updated_at, d.delivered_at
            FROM integration_deliveries d JOIN integrations i ON i.id=d.integration_id
            ORDER BY d.id DESC LIMIT 100""").fetchall()
    return {"summary": {key: int(totals[key] or 0) for key in ("total", "delivered", "failed", "pending")},
            "recent_deliveries": [dict(row) for row in rows],
            "delivery_semantics": "Synchronous bounded retries; alert deliveries are deduplicated per integration and alert."}

@app.delete("/api/integrations/{integration_id}")
def delete_integration(integration_id: int, admin=Depends(require_roles("Admin"))):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM integrations WHERE id = ?", (integration_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Integration not found.")
        conn.execute("DELETE FROM integration_deliveries WHERE integration_id = ?", (integration_id,))
        conn.execute("DELETE FROM integrations WHERE id = ?", (integration_id,))
    log_activity("Integration removed", f"{row['display_name']} ({row['provider']}) was removed from the integration registry along with its delivery telemetry.", "Integration", integration_id)
    return {"message": "Integration removed successfully"}


# Fix recommendation workflow. Recommendations are advisory; this API never edits
# source code, configuration files, repositories, or external systems.
def build_fix_for_issue(issue):
    text = (issue["title"] + " " + issue["description"] + " " + issue["cause"]).lower()
    if "timeout" in text or "slow" in text:
        title = "Review timeout and performance configuration"
        rationale = "The issue indicates a slow operation or request timeout. First identify the slow dependency before changing limits."
        before = "# Current configuration (example only)\nREQUEST_TIMEOUT = 30"
        after = "# Suggested review (not an automatic production change)\n# Measure dependency latency, then choose a justified timeout value.\nREQUEST_TIMEOUT = <validated_value>"
        steps = "1. Measure endpoint and dependency response times.\n2. Inspect slow database queries and external calls.\n3. Reproduce the issue in a staging environment.\n4. Change timeout values only after confirming the bottleneck."
    elif "database" in text or "connection" in text:
        title = "Review database connectivity and pooling"
        rationale = "The issue may involve database availability, credentials, network access, or connection-pool exhaustion."
        before = "# Existing database settings\nDB_POOL_SIZE = <current_value>"
        after = "# Suggested review\n# Validate credentials and pool usage before changing settings.\nDB_POOL_SIZE = <capacity_based_value>"
        steps = "1. Confirm database service health.\n2. Verify network route and secret configuration.\n3. Inspect active, idle, and waiting connections.\n4. Test any pool adjustment outside production first."
    elif "memory" in text or "memoryerror" in text:
        title = "Investigate memory usage and resource limits"
        rationale = "The issue suggests memory pressure; a restart alone may hide an underlying leak."
        before = "# Current memory behavior\n# No verified memory profile attached"
        after = "# Recommended action\n# Capture memory profile and identify retaining objects before tuning limits"
        steps = "1. Capture process memory metrics.\n2. Profile allocations and object retention.\n3. Check container or host memory limits.\n4. Validate the fix with a repeatable load test."
    elif "permission" in text or "unauthorized" in text or "access" in text:
        title = "Review access control and permissions"
        rationale = "The issue may be caused by missing privileges, expired credentials, or an incorrect role mapping."
        before = "# Existing access policy\n# Not available in issue data"
        after = "# Suggested review\n# Grant only the minimum required permission after policy verification"
        steps = "1. Identify the exact operation and principal.\n2. Inspect role and permission mappings.\n3. Verify credential expiry and secret rotation.\n4. Apply least-privilege changes in a test environment."
    elif "validation" in text or "invalid input" in text:
        title = "Strengthen input validation"
        rationale = "The issue indicates that incoming data may not satisfy expected constraints."
        before = "# Existing input handling\n# Validation behavior not attached"
        after = "# Suggested validation pattern\n# Validate type, required fields, range, and format before processing"
        steps = "1. Define required fields and accepted formats.\n2. Add server-side validation.\n3. Return clear validation errors.\n4. Test valid, invalid, and boundary inputs."
    else:
        title = "Perform targeted root-cause investigation"
        rationale = "The available issue details are not sufficient to safely propose a specific code change."
        before = "# Current implementation\n# Source code or configuration was not provided"
        after = "# Recommended next state\n# Collect reproduction steps, relevant logs, and affected component details"
        steps = "1. Reproduce the issue in a non-production environment.\n2. Collect relevant logs and stack traces.\n3. Identify the responsible component.\n4. Create and review a specific patch before deployment."
    return title, rationale, before, after, steps

@app.get("/api/fixes")
def get_fix_recommendations(user=Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute("SELECT f.*, i.title AS issue_title, i.system AS issue_system, i.severity AS issue_severity FROM fix_recommendations f JOIN issues i ON i.id = f.issue_id ORDER BY f.id DESC").fetchall()
    return [dict(row) for row in rows]

@app.post("/api/issues/{issue_id}/fix-recommendations")
def create_fix_recommendation(issue_id: int, user=Depends(require_roles("Admin", "Developer"))):
    with get_connection() as conn:
        issue = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if issue is None:
            raise HTTPException(status_code=404, detail="Issue not found.")
        title, rationale, before_text, after_text, steps = build_fix_for_issue(issue)
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "INSERT INTO fix_recommendations (issue_id, title, rationale, before_text, after_text, steps, status, created_at, updated_at, created_by_email) VALUES (?, ?, ?, ?, ?, ?, 'Proposed', ?, ?, ?)",
            (issue_id, title, rationale, before_text, after_text, steps, now, now, user["email"]),
        )
        fix_id = cursor.lastrowid
        conn.execute("INSERT INTO fix_workflow_events (fix_id, actor_email, action, from_status, to_status, details, created_at) VALUES (?, ?, 'PROPOSED', NULL, 'Proposed', ?, ?)", (fix_id, user["email"], "Recommendation generated for independent review; no system change performed.", now))
        row = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
    item = dict(row)
    log_activity("Fix recommendation generated", f"A review-only recommendation was generated for issue #{issue_id}: {title}.", "Fix", item["id"])
    return {"message": "Fix recommendation generated for review", "fix": item}

@app.patch("/api/fixes/{fix_id}")
def update_fix_status(fix_id: int, update: FixStatusUpdate, user=Depends(require_roles("Admin"))):
    """Independent Admin approval/rejection; the recommendation author cannot approve their own work."""
    if update.status not in {"Approved", "Rejected"}:
        raise HTTPException(status_code=400, detail="Fix status must be Approved or Rejected.")
    reason = (update.rejection_reason or "").strip()
    if update.status == "Rejected" and len(reason) < 5:
        raise HTTPException(status_code=400, detail="Provide a rejection reason of at least 5 characters.")
    with get_connection() as conn:
        fix = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
        if fix is None:
            raise HTTPException(status_code=404, detail="Fix recommendation not found.")
        if fix["status"] != "Proposed":
            raise HTTPException(status_code=409, detail="Only a proposed recommendation can be approved or rejected.")
        if fix["created_by_email"] and fix["created_by_email"].lower() == user["email"].lower():
            raise HTTPException(status_code=403, detail="Maker-checker policy: the recommendation author cannot approve or reject their own recommendation.")
        now = datetime.now(timezone.utc).isoformat()
        if update.status == "Approved":
            conn.execute("UPDATE fix_recommendations SET status = 'Approved', approved_by_email = ?, approved_at = ?, rejection_reason = NULL, updated_at = ? WHERE id = ?", (user["email"], now, now, fix_id))
            details = "Independently approved by an Admin. Approval does not execute or deploy the recommendation."
        else:
            conn.execute("UPDATE fix_recommendations SET status = 'Rejected', rejection_reason = ?, updated_at = ? WHERE id = ?", (reason, now, fix_id))
            details = f"Rejected by Admin. Reason: {reason}"
        conn.execute("INSERT INTO fix_workflow_events (fix_id, actor_email, action, from_status, to_status, details, created_at) VALUES (?, ?, ?, 'Proposed', ?, ?, ?)", (fix_id, user["email"], update.status.upper(), update.status, details, now))
        row = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
    item = dict(row)
    log_activity(f"Fix {update.status.lower()}", f"Recommendation #{fix_id} for issue #{item['issue_id']} was {update.status.lower()} by {user['email']}.", "Fix", fix_id)
    return {"message": f"Fix recommendation {update.status.lower()}", "fix": item}

@app.post("/api/fixes/{fix_id}/prepare")
def prepare_approved_fix(fix_id: int, user=Depends(require_roles("Admin"))):
    with get_connection() as conn:
        fix = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
        if fix is None:
            raise HTTPException(status_code=404, detail="Fix recommendation not found.")
        if fix["status"] != "Approved":
            raise HTTPException(status_code=409, detail="Only an approved recommendation can be prepared.")
        if fix["created_by_email"] and fix["created_by_email"].lower() == user["email"].lower():
            raise HTTPException(status_code=403, detail="The recommendation author cannot prepare their own recommendation.")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("UPDATE fix_recommendations SET status = 'Prepared', updated_at = ? WHERE id = ?", (now, fix_id))
        conn.execute("INSERT INTO fix_workflow_events (fix_id, actor_email, action, from_status, to_status, details, created_at) VALUES (?, ?, 'PREPARED', 'Approved', 'Prepared', ?, ?)", (fix_id, user["email"], "Prepared for manual review/application; no external system was changed.", now))
        row = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
    item = dict(row)
    log_activity("Fix prepared for manual application", f"Recommendation #{fix_id} was approved and prepared. No external system was modified; apply and verify the change manually.", "Fix", fix_id)
    return {"message": "Fix prepared. No external system was changed.", "fix": item, "execution_enabled": False}



@app.get("/api/fix-executions")
def list_fix_executions(user=Depends(require_roles("Admin", "Developer"))):
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM fix_executions ORDER BY id DESC LIMIT 250").fetchall()
    return [dict(row) for row in rows]

@app.post("/api/fixes/{fix_id}/execute")
def simulate_fix_execution(fix_id: int, confirmation: SimulationConfirm, user=Depends(require_roles("Admin"))):
    """Runs an explicitly confirmed workflow simulation only; never changes a live system."""
    if confirmation.confirmation != "SIMULATE":
        raise HTTPException(status_code=400, detail="Type SIMULATE to confirm this non-production workflow simulation.")
    with get_connection() as conn:
        fix = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
        if fix is None:
            raise HTTPException(status_code=404, detail="Fix recommendation not found.")
        if fix["status"] != "Prepared":
            raise HTTPException(status_code=409, detail="Only a prepared fix can enter the execution simulation.")
        if fix["created_by_email"] and fix["created_by_email"].lower() == user["email"].lower():
            raise HTTPException(status_code=403, detail="The recommendation author cannot execute its simulation.")
        now = datetime.now(timezone.utc).isoformat()
        details = "Controlled workflow simulation completed. No source files, databases, repositories, or external systems were modified."
        cursor = conn.execute(
            "INSERT INTO fix_executions (fix_id, issue_id, action, status, actor_email, details, created_at) VALUES (?, ?, 'SIMULATE', 'Simulated', ?, ?, ?)",
            (fix_id, fix["issue_id"], user["email"], details, now)
        )
        conn.execute("UPDATE fix_recommendations SET status = 'Simulated', updated_at = ? WHERE id = ?", (now, fix_id))
        conn.execute("INSERT INTO fix_workflow_events (fix_id, actor_email, action, from_status, to_status, details, created_at) VALUES (?, ?, 'SIMULATION', 'Prepared', 'Simulated', ?, ?)", (fix_id, user["email"], "Explicitly confirmed simulation completed. No source, configuration, database, repository, or external system was modified.", now))
        execution = conn.execute("SELECT * FROM fix_executions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        updated_fix = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
    log_activity("Fix execution simulated", f"Fix #{fix_id} workflow simulation completed by {user['email']}; no external changes were made.", "Fix", fix_id)
    return {"message": "Simulation completed. No external system was modified.", "execution": dict(execution), "fix": dict(updated_fix), "real_execution": False}

@app.post("/api/fixes/{fix_id}/rollback")
def rollback_simulated_fix(fix_id: int, user=Depends(require_roles("Admin"))):
    """Closes a simulation record; no external rollback is performed because no live change was made."""
    with get_connection() as conn:
        fix = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
        if fix is None:
            raise HTTPException(status_code=404, detail="Fix recommendation not found.")
        if fix["status"] != "Simulated":
            raise HTTPException(status_code=409, detail="Only a simulated fix can be marked as rolled back.")
        now = datetime.now(timezone.utc).isoformat()
        details = "Simulation marked rolled back for audit purposes. No external system changes existed to reverse."
        cursor = conn.execute(
            "INSERT INTO fix_executions (fix_id, issue_id, action, status, actor_email, details, created_at) VALUES (?, ?, 'ROLLBACK_SIMULATION', 'Rolled Back', ?, ?, ?)",
            (fix_id, fix["issue_id"], user["email"], details, now)
        )
        conn.execute("UPDATE fix_recommendations SET status = 'Rolled Back', updated_at = ? WHERE id = ?", (now, fix_id))
        conn.execute("INSERT INTO fix_workflow_events (fix_id, actor_email, action, from_status, to_status, details, created_at) VALUES (?, ?, 'SIMULATION_ROLLBACK', 'Simulated', 'Rolled Back', ?, ?)", (fix_id, user["email"], "Simulation record closed; no live rollback was required or performed.", now))
        execution = conn.execute("SELECT * FROM fix_executions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        updated_fix = conn.execute("SELECT * FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
    log_activity("Fix simulation rolled back", f"Fix #{fix_id} simulation was marked rolled back by {user['email']}.", "Fix", fix_id)
    return {"message": "Simulation marked rolled back. No external system changes existed.", "execution": dict(execution), "fix": dict(updated_fix), "real_rollback": False}

@app.get("/api/fixes/{fix_id}/workflow-history")
def get_fix_workflow_history(fix_id: int, user=Depends(require_roles("Admin", "Developer"))):
    with get_connection() as conn:
        fix = conn.execute("SELECT id FROM fix_recommendations WHERE id = ?", (fix_id,)).fetchone()
        if fix is None:
            raise HTTPException(status_code=404, detail="Fix recommendation not found.")
        rows = conn.execute("SELECT id, fix_id, actor_email, action, from_status, to_status, details, created_at FROM fix_workflow_events WHERE fix_id = ? ORDER BY id ASC", (fix_id,)).fetchall()
    return {"fix_id": fix_id, "events": [dict(row) for row in rows]}

# Root-cause analysis and issue correlation (transparent, deterministic heuristics).
# This module does not call an external LLM or claim probabilistic AI diagnosis.
ROOT_CAUSE_RULES = [
    ("Database", ["database", "sql", "connection pool", "query"], "Database availability, connectivity, credentials, or connection-pool pressure", "Check database health, network reachability, credentials, query latency, and active connections.", "Database service or data access may be degraded."),
    ("Performance", ["timeout", "slow", "latency", "loading", "performance"], "A slow dependency, expensive operation, or insufficient resource capacity", "Measure request latency, inspect slow queries and external calls, and profile the affected service.", "Users may experience delayed responses or degraded availability."),
    ("Memory", ["memory", "oom", "out of memory", "memoryerror"], "Memory pressure or a possible memory leak", "Capture memory metrics, profile allocations, inspect recent deployments, and verify container or host limits.", "The process may become unstable or terminate under load."),
    ("Authentication", ["login", "auth", "unauthorized", "permission", "access denied", "credential"], "Authentication, authorization, credential, or role configuration", "Review failed-login patterns, token expiry, role mappings, and least-privilege access policies.", "Users or services may be blocked from legitimate operations."),
    ("Network", ["connection reset", "broken pipe", "network", "unreachable", "connection lost"], "Network interruption or an unavailable downstream service", "Check service health, DNS, network routes, TLS configuration, and retry behavior.", "Requests between dependent services may fail intermittently."),
    ("Validation", ["validation", "invalid input", "bad request", "input"], "Input format or validation rules do not match the received data", "Inspect the request payload, schema constraints, required fields, and boundary cases.", "Invalid data may be rejected or may reach an unintended processing path."),
]

def _issue_diagnostic_profile(issue):
    """Build an explainable weighted profile; this is heuristic scoring, not probability."""
    fields = {
        "title": str(issue["title"] or "").lower(),
        "description": str(issue["description"] or "").lower(),
        "cause": str(issue["cause"] or "").lower(),
        "recommendation": str(issue["recommendation"] or "").lower(),
        "system": str(issue["system"] or "").lower(),
    }
    weights = {"title": 3.0, "description": 2.5, "cause": 1.0, "recommendation": 0.5, "system": 0.5}
    scored = []
    for category, keywords, cause, actions, impact in ROOT_CAUSE_RULES:
        matched = []
        direct_terms = []
        field_hits = []
        score = 0.0
        for keyword in keywords:
            escaped = re.escape(keyword.lower())
            pattern = rf"(?<![a-z0-9]){escaped}(?![a-z0-9])"
            locations = [name for name, value in fields.items() if re.search(pattern, value)]
            if locations:
                matched.append(keyword)
                if any(name in {"title", "description"} for name in locations):
                    direct_terms.append(keyword)
                field_hits.extend(locations)
                score += max(weights[name] for name in locations)
                if "title" in locations and "description" in locations:
                    score += 0.75
        if matched:
            distinct_fields = sorted(set(field_hits))
            scored.append({
                "category": category, "score": round(score, 2),
                "matched_terms": matched, "direct_terms": direct_terms,
                "matched_fields": distinct_fields,
                "cause": cause, "actions": actions, "impact": impact,
            })

    scored.sort(key=lambda item: (item["score"], len(item["matched_fields"]), item["category"] == "Database"), reverse=True)
    if not scored:
        return {
            "category": "General", "score": 0.0, "confidence": "Low",
            "matched_terms": [], "direct_terms": [], "matched_fields": [], "alternatives": [],
            "cause": "The available issue details do not identify one sufficiently specific root cause.",
            "actions": "Collect a timestamped stack trace, reproduction steps, recent deployment details, and surrounding logs.",
            "impact": "The affected component may continue to fail until more context is collected.",
        }

    winner = scored[0]
    runner_up = scored[1]["score"] if len(scored) > 1 else 0.0
    margin = winner["score"] - runner_up
    # Confidence is a coarse explainability label, deliberately not a probability.
    if winner["score"] >= 6 and margin >= 2:
        confidence = "High"
    elif winner["score"] >= 3 and margin >= 1:
        confidence = "Moderate"
    else:
        confidence = "Low"
    winner["confidence"] = confidence
    winner["alternatives"] = [
        {"category": item["category"], "score": item["score"], "matched_terms": item["matched_terms"]}
        for item in scored[1:4]
    ]
    return winner


def classify_issue(issue):
    profile = _issue_diagnostic_profile(issue)
    description = str(issue["description"] or "")
    title = str(issue["title"] or "")
    source_line = description.split(": ", 1)[1] if description.lower().startswith("line ") and ": " in description else description
    evidence = [
        f"Weighted diagnostic score: {profile['score']:.2f} (heuristic; not a probability)",
        f"Matched diagnostic terms: {', '.join(profile['matched_terms'][:8]) or 'None'}",
        f"Evidence fields: {', '.join(profile['matched_fields']) or 'None'}",
    ]
    if source_line.strip():
        evidence.append(f"Source evidence: {source_line[:500]}")
    if title.strip():
        evidence.append(f"Issue title: {title[:200]}")
    if profile["alternatives"]:
        evidence.append("Alternative categories: " + "; ".join(
            f"{item['category']} ({item['score']:.2f})" for item in profile["alternatives"]
        ))
    return profile["category"], profile["cause"], evidence, profile["impact"], profile["actions"], profile["confidence"]

@app.post("/api/issues/{issue_id}/root-cause")
def analyze_issue_root_cause(issue_id: int, user=Depends(require_roles("Admin", "Developer"))):
    with get_connection() as conn:
        issue = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if issue is None:
            raise HTTPException(status_code=404, detail="Issue not found.")
        profile = _issue_diagnostic_profile(issue)
        category, cause, evidence, impact, actions, confidence = classify_issue(issue)
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "INSERT INTO root_cause_reports (issue_id, probable_cause, evidence, impact, confidence, recommended_actions, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (issue_id, cause, json.dumps(evidence), impact, confidence, actions, category, now),
        )
        row = conn.execute("SELECT * FROM root_cause_reports WHERE id = ?", (cursor.lastrowid,)).fetchone()
    report = dict(row)
    report["evidence"] = json.loads(report["evidence"])
    log_activity("Root-cause analysis generated", f"A {confidence.lower()}-confidence, rule-based analysis was generated for issue #{issue_id} ({category}).", "Root Cause", report["id"])
    return {
        "message": "Root-cause analysis generated", "report": report,
        "analysis_type": "deterministic-rule-based",
        "diagnostic_score": profile["score"],
        "alternative_categories": profile["alternatives"],
        "matched_terms": profile["matched_terms"],
        "matched_fields": profile["matched_fields"],
    }

@app.get("/api/root-cause-reports")
def get_root_cause_reports(limit: int = 100, user=Depends(get_current_user)):
    limit = max(1, min(limit, 300))
    with get_connection() as conn:
        rows = conn.execute("""SELECT r.*, i.title AS issue_title, i.system AS issue_system, i.severity AS issue_severity
            FROM root_cause_reports r JOIN issues i ON i.id = r.issue_id ORDER BY r.id DESC LIMIT ?""", (limit,)).fetchall()
    results = []
    for row in rows:
        item = dict(row)
        item["evidence"] = json.loads(item["evidence"])
        results.append(item)
    return results

def _correlation_tokens(issue):
    text = " ".join(str(issue[key] or "") for key in ("title", "description")).lower()
    text = re.sub(r"^line\s+\d+\s*:\s*", "", text)
    stop_words = {"the", "and", "for", "with", "from", "this", "that", "may", "could", "into", "when", "then", "are", "was", "were", "has", "have", "had", "issue", "error", "failed", "failure", "application", "system"}
    return {token for token in re.findall(r"[a-z][a-z0-9_]{2,}", text) if token not in stop_words}


def _correlate_pair(left, right):
    left_profile = left["profile"]
    right_profile = right["profile"]
    if left_profile["category"] != right_profile["category"] or left_profile["category"] == "General":
        return None
    left_terms = set(left_profile["direct_terms"])
    right_terms = set(right_profile["direct_terms"])
    shared_terms = sorted(left_terms & right_terms)
    left_tokens = _correlation_tokens(left["issue"])
    right_tokens = _correlation_tokens(right["issue"])
    shared_tokens = sorted(left_tokens & right_tokens)
    union = left_tokens | right_tokens
    lexical_overlap = (len(left_tokens & right_tokens) / len(union)) if union else 0.0
    # A shared diagnostic rule term is the strongest link; lexical overlap is supporting evidence only.
    score = min(100, round((len(shared_terms) * 32) + (lexical_overlap * 40)))
    if not shared_terms and (lexical_overlap < 0.28 or len(shared_tokens) < 2):
        return None
    if score < 25:
        return None
    return {"issue_ids": [left["issue"]["id"], right["issue"]["id"]],
            "score": score, "shared_signals": shared_terms or shared_tokens[:5]}


@app.get("/api/issue-correlations")
def get_issue_correlations(user=Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM issues ORDER BY id DESC LIMIT 500").fetchall()
    profiles = []
    for row in rows:
        issue = dict(row)
        profile = _issue_diagnostic_profile(issue)
        profiles.append({"issue": issue, "profile": profile})

    by_category = {}
    for item in profiles:
        by_category.setdefault(item["profile"]["category"], []).append(item)

    groups = []
    for category, items in by_category.items():
        if len(items) < 2:
            continue
        adjacency = {item["issue"]["id"]: set() for item in items}
        pair_links = []
        for index, left in enumerate(items):
            for right in items[index + 1:]:
                link = _correlate_pair(left, right)
                if link:
                    a, b = link["issue_ids"]
                    adjacency[a].add(b)
                    adjacency[b].add(a)
                    pair_links.append(link)
        visited = set()
        issue_lookup = {item["issue"]["id"]: item for item in items}
        for item in items:
            root_id = item["issue"]["id"]
            if root_id in visited or not adjacency[root_id]:
                continue
            stack, component_ids = [root_id], []
            visited.add(root_id)
            while stack:
                current = stack.pop()
                component_ids.append(current)
                for neighbor in adjacency[current]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        stack.append(neighbor)
            component_links = [link for link in pair_links if set(link["issue_ids"]).issubset(set(component_ids))]
            component_items = [issue_lookup[issue_id] for issue_id in component_ids]
            avg_score = round(sum(link["score"] for link in component_links) / len(component_links)) if component_links else 0
            shared_signals = sorted({signal for link in component_links for signal in link["shared_signals"]})
            group_confidence = "High" if avg_score >= 65 and len(component_links) >= 2 else "Moderate" if avg_score >= 35 else "Low"
            group_index = len(groups) + 1
            groups.append({
                "group_id": f"{category.lower()}-{group_index}",
                "category": category,
                "count": len(component_items),
                "summary": f"{len(component_items)} issue(s) form a connected diagnostic cluster; average pairwise similarity is {avg_score}/100.",
                "suggested_focus": next((rule[3] for rule in ROOT_CAUSE_RULES if rule[0] == category), "Collect more diagnostic context."),
                "confidence": group_confidence,
                "correlation_score": avg_score,
                "shared_signals": shared_signals,
                "relationships": component_links,
                "issues": [{
                    "id": entry["issue"]["id"], "title": entry["issue"]["title"],
                    "system": entry["issue"]["system"], "severity": entry["issue"]["severity"],
                    "status": entry["issue"]["status"],
                    "diagnostic_score": entry["profile"]["score"],
                    "diagnostic_confidence": entry["profile"]["confidence"],
                    "evidence": [f"Matched terms: {', '.join(entry['profile']['matched_terms']) or 'None'}"],
                } for entry in component_items],
            })
    groups.sort(key=lambda group: (group["correlation_score"], group["count"]), reverse=True)
    log_activity("Issue correlation refreshed", f"Correlation analysis reviewed {len(rows)} issue(s) and found {len(groups)} evidence-linked cluster(s).", "Correlation", None)
    return {
        "total_issues_reviewed": len(rows), "groups": groups,
        "method": "weighted diagnostic signatures plus pairwise lexical overlap; heuristic correlation, not causal proof",
        "unclustered_issues": len(rows) - len({issue["id"] for group in groups for issue in group["issues"]}),
    }


# Reporting and notification center (v1.2)
@app.get("/api/reports/summary")
def get_report_summary(user=Depends(get_current_user)):
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM issues").fetchone()[0]
        open_count = conn.execute("SELECT COUNT(*) FROM issues WHERE status = 'Open'").fetchone()[0]
        severity_rows = conn.execute("SELECT severity, COUNT(*) AS count FROM issues GROUP BY severity").fetchall()
        status_rows = conn.execute("SELECT status, COUNT(*) AS count FROM issues GROUP BY status").fetchall()
        system_rows = conn.execute("SELECT system, COUNT(*) AS count FROM issues GROUP BY system ORDER BY count DESC").fetchall()
        recent = conn.execute("SELECT id, title, system, severity, status, description FROM issues ORDER BY id DESC LIMIT 20").fetchall()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_issues": total,
        "open_issues": open_count,
        "severity_breakdown": [dict(row) for row in severity_rows],
        "status_breakdown": [dict(row) for row in status_rows],
        "system_breakdown": [dict(row) for row in system_rows],
        "recent_issues": [dict(row) for row in recent],
    }


@app.get("/api/intelligence/trends")
def get_intelligence_trends(user=Depends(get_current_user)):
    """Return evidence-backed incident trends from existing issue and audit records.

    Issue rows do not carry creation timestamps in the current schema, so historical
    creation trends are derived only from explicit `Issue created` audit events.
    Existing seeded/imported issues without those events are excluded from the trend.
    """
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(days=13)).date()
    day_counts = {(window_start + timedelta(days=offset)).isoformat(): 0 for offset in range(14)}

    with get_connection() as conn:
        issue_rows = conn.execute("SELECT * FROM issues ORDER BY id DESC").fetchall()
        creation_events = conn.execute(
            "SELECT entity_id, created_at FROM audit_logs "
            "WHERE entity_type = 'Issue' AND action = 'Issue created' AND entity_id IS NOT NULL "
            "ORDER BY id DESC"
        ).fetchall()

    created_at_by_issue = {}
    for event in creation_events:
        try:
            event_time = datetime.fromisoformat(str(event["created_at"]).replace("Z", "+00:00"))
            if event_time.tzinfo is None:
                event_time = event_time.replace(tzinfo=timezone.utc)
            created_at_by_issue.setdefault(int(event["entity_id"]), event_time.astimezone(timezone.utc))
            day_key = event_time.astimezone(timezone.utc).date().isoformat()
            if day_key in day_counts:
                day_counts[day_key] += 1
        except (TypeError, ValueError, OverflowError):
            continue

    issues = [dict(row) for row in issue_rows]

    # Incident aging is based only on verifiable issue-creation audit events.
    # It is an operational visibility signal, not an SLA or resolution-time claim.
    aging_bucket_counts = {
        "Under 24 hours": 0,
        "1–3 days": 0,
        "3–7 days": 0,
        "Over 7 days": 0,
    }
    open_issues_with_age = []
    open_issues_without_creation_event = 0
    for issue in issues:
        if issue.get("status") != "Open":
            continue
        issue_id = int(issue["id"])
        created_at = created_at_by_issue.get(issue_id)
        if created_at is None:
            open_issues_without_creation_event += 1
            continue
        age_hours = max(0.0, (now - created_at).total_seconds() / 3600)
        age_days = age_hours / 24
        if age_hours < 24:
            bucket = "Under 24 hours"
        elif age_days < 3:
            bucket = "1–3 days"
        elif age_days < 7:
            bucket = "3–7 days"
        else:
            bucket = "Over 7 days"
        aging_bucket_counts[bucket] += 1
        open_issues_with_age.append({
            "id": issue_id,
            "title": issue["title"],
            "system": issue["system"],
            "severity": issue["severity"],
            "age_hours": round(age_hours, 1),
            "age_days": round(age_days, 2),
            "age_bucket": bucket,
            "created_at": created_at.isoformat(),
        })
    open_issues_with_age.sort(key=lambda item: (item["age_hours"], item["id"]), reverse=True)

    recurrence_groups = {}
    for issue in issues:
        normalized_title = re.sub(r"[^a-z0-9]+", " ", str(issue.get("title", "")).lower()).strip()
        normalized_system = re.sub(r"[^a-z0-9]+", " ", str(issue.get("system", "")).lower()).strip()
        if not normalized_title:
            continue
        key = (normalized_system, normalized_title)
        recurrence_groups.setdefault(key, []).append(issue)

    recurring = []
    recurrence_count_by_id = {}
    for (system_key, title_key), group in recurrence_groups.items():
        if len(group) < 2:
            continue
        ids = [int(item["id"]) for item in group]
        for issue_id in ids:
            recurrence_count_by_id[issue_id] = len(group)
        recurring.append({
            "system": group[0]["system"],
            "title": group[0]["title"],
            "occurrences": len(group),
            "open_occurrences": sum(1 for item in group if item["status"] == "Open"),
            "issue_ids": sorted(ids, reverse=True),
            "latest_issue_id": max(ids),
            "signal": "Exact normalized title and system match",
        })
    recurring.sort(key=lambda item: (item["open_occurrences"], item["occurrences"]), reverse=True)

    priority_queue = []
    severity_points = {"Critical": 45, "High": 32, "Medium": 20, "Low": 10}
    for issue in issues:
        if issue.get("status") != "Open":
            continue
        severity = str(issue.get("severity", ""))
        score = severity_points.get(severity, 8)
        reasons = [f"{severity or 'Unclassified'} severity"]
        score += 25
        reasons.append("Issue is still open")
        recurrence = recurrence_count_by_id.get(int(issue["id"]), 1)
        if recurrence > 1:
            recurrence_points = min(20, 5 * (recurrence - 1))
            score += recurrence_points
            reasons.append(f"Repeated {recurrence} times with the same normalized title and system")
        created_at = created_at_by_issue.get(int(issue["id"]))
        if created_at:
            age_days = max(0, (now - created_at).total_seconds() / 86400)
            if age_days <= 1:
                score += 10
                reasons.append("Created within the last 24 hours")
            elif age_days <= 7:
                score += 5
                reasons.append("Created within the last 7 days")
        score = min(100, score)
        priority_queue.append({
            "id": int(issue["id"]),
            "title": issue["title"],
            "system": issue["system"],
            "severity": severity,
            "status": issue["status"],
            "priority_score": score,
            "recurrence_count": recurrence,
            "reasons": reasons,
        })
    priority_queue.sort(key=lambda item: (item["priority_score"], item["id"]), reverse=True)

    return {
        "generated_at": now.isoformat(),
        "trend_window_days": 14,
        "issue_creation_trend": [{"date": day, "count": count} for day, count in day_counts.items()],
        "trend_source": "Issue created audit events only",
        "trend_events_counted": sum(day_counts.values()),
        "issues_without_creation_audit_event": sum(1 for item in issues if int(item["id"]) not in created_at_by_issue),
        "recurring_incidents": recurring[:10],
        "priority_queue": priority_queue[:10],
        "open_issue_aging": {
            "bucket_counts": aging_bucket_counts,
            "issues_with_verified_age": len(open_issues_with_age),
            "open_issues_without_creation_audit_event": open_issues_without_creation_event,
            "oldest_open_issues": open_issues_with_age[:10],
            "source": "Issue created audit events matched by issue ID",
            "limitations": "Only open issues with a valid creation audit event are aged. Age is elapsed time since creation, not time since last update, and buckets are not contractual SLAs.",
        },
        "priority_method": "Deterministic heuristic: severity, open status, exact-title recurrence, and audit-event recency; not an SLA or predictive model",
    }


@app.get("/api/intelligence/forecast")
def get_incident_forecast(user=Depends(get_current_user)):
    """Return a transparent, low-complexity incident-volume outlook.

    This is a deterministic trend extrapolation, not an ML model or probability
    of failure. Only valid `Issue created` audit events are used as time-series
    observations. Existing issues without such events remain outside the forecast.
    """
    now = datetime.now(timezone.utc)
    today = now.date()
    current_start = today - timedelta(days=6)
    previous_start = today - timedelta(days=13)
    history_start = previous_start

    with get_connection() as conn:
        issue_rows = conn.execute(
            "SELECT id, title, system, severity, status FROM issues ORDER BY id DESC"
        ).fetchall()
        event_rows = conn.execute(
            "SELECT entity_id, created_at FROM audit_logs "
            "WHERE entity_type = 'Issue' AND action = 'Issue created' "
            "AND entity_id IS NOT NULL ORDER BY id DESC"
        ).fetchall()

    issues_by_id = {int(row["id"]): dict(row) for row in issue_rows}
    previous_counts = {}
    current_counts = {}
    valid_events = 0
    unassigned_events = 0
    recorded_creation_ids = set()
    for event in event_rows:
        try:
            event_issue_id = int(event["entity_id"])
            recorded_creation_ids.add(event_issue_id)
            event_time = datetime.fromisoformat(str(event["created_at"]).replace("Z", "+00:00"))
            if event_time.tzinfo is None:
                event_time = event_time.replace(tzinfo=timezone.utc)
            event_day = event_time.astimezone(timezone.utc).date()
            if event_day < history_start or event_day > today:
                continue
            issue = issues_by_id.get(event_issue_id)
            if issue is None:
                unassigned_events += 1
                continue
            valid_events += 1
            system = str(issue.get("system") or "Unspecified")
            target = current_counts if event_day >= current_start else previous_counts
            target[system] = target.get(system, 0) + 1
        except (TypeError, ValueError, OverflowError):
            continue

    systems = sorted(set(previous_counts) | set(current_counts))
    system_outlook = []
    total_previous = sum(previous_counts.values())
    total_current = sum(current_counts.values())
    for system in systems:
        previous = previous_counts.get(system, 0)
        current = current_counts.get(system, 0)
        change = current - previous
        projected = max(0, current + change)
        if change > 0:
            direction = "Increasing"
        elif change < 0:
            direction = "Decreasing"
        else:
            direction = "Stable"
        system_outlook.append({
            "system": system,
            "previous_7_days": previous,
            "recent_7_days": current,
            "change": change,
            "direction": direction,
            "projected_next_7_days": projected,
            "method": "Recent 7-day count plus the observed change versus the preceding 7 days",
        })
    system_outlook.sort(key=lambda item: (item["projected_next_7_days"], item["recent_7_days"]), reverse=True)

    normalized_groups = {}
    for row in issue_rows:
        item = dict(row)
        if item["status"] != "Open":
            continue
        title_key = re.sub(r"[^a-z0-9]+", " ", str(item["title"]).lower()).strip()
        system_key = re.sub(r"[^a-z0-9]+", " ", str(item["system"]).lower()).strip()
        if title_key:
            normalized_groups.setdefault((system_key, title_key), []).append(item)

    signals = []
    for group in normalized_groups.values():
        if len(group) >= 2:
            signals.append({
                "type": "Recurring open signature",
                "severity": "High" if any(row["severity"] in ("Critical", "High") for row in group) else "Medium",
                "system": group[0]["system"],
                "detail": f"{len(group)} open issues share the same normalized title and system.",
                "issue_ids": sorted([int(row["id"]) for row in group], reverse=True)[:10],
                "evidence_count": len(group),
            })

    for item in system_outlook:
        if item["recent_7_days"] >= 2 and item["change"] > 0:
            signals.append({
                "type": "Rising incident volume",
                "severity": "High" if item["change"] >= 3 else "Medium",
                "system": item["system"],
                "detail": f"{item['recent_7_days']} creation events in the recent 7 days versus {item['previous_7_days']} in the preceding 7 days.",
                "issue_ids": [],
                "evidence_count": item["recent_7_days"],
            })

    critical_open = sum(1 for row in issue_rows if row["status"] == "Open" and row["severity"] == "Critical")
    high_open = sum(1 for row in issue_rows if row["status"] == "Open" and row["severity"] == "High")
    if critical_open:
        signals.append({
            "type": "Unresolved critical incidents", "severity": "Critical", "system": "Multiple systems",
            "detail": f"{critical_open} critical issue(s) are currently open.", "issue_ids": [], "evidence_count": critical_open,
        })
    elif high_open:
        signals.append({
            "type": "Unresolved high-severity incidents", "severity": "High", "system": "Multiple systems",
            "detail": f"{high_open} high-severity issue(s) are currently open.", "issue_ids": [], "evidence_count": high_open,
        })

    if valid_events < 5:
        confidence = "Insufficient evidence"
        confidence_note = "Fewer than five valid issue-creation events were available in the 14-day comparison window. Treat the projection as unavailable for operational decisions."
        projected_total = None
    elif valid_events < 20:
        confidence = "Low"
        confidence_note = "Limited event volume; this directional estimate is sensitive to individual incidents."
        projected_total = max(0, total_current + (total_current - total_previous))
    else:
        confidence = "Moderate"
        confidence_note = "At least 20 valid events are available, but this remains a short-window trend extrapolation rather than a validated predictive model."
        projected_total = max(0, total_current + (total_current - total_previous))

    if total_current > total_previous:
        overall_direction = "Increasing"
    elif total_current < total_previous:
        overall_direction = "Decreasing"
    else:
        overall_direction = "Stable"

    signals.sort(key=lambda item: ({"Critical": 3, "High": 2, "Medium": 1}.get(item["severity"], 0), item["evidence_count"]), reverse=True)
    return {
        "generated_at": now.isoformat(),
        "comparison_window_days": 14,
        "previous_7_days": total_previous,
        "recent_7_days": total_current,
        "change": total_current - total_previous,
        "direction": overall_direction,
        "projected_next_7_days": projected_total,
        "confidence": confidence,
        "confidence_note": confidence_note,
        "valid_creation_events": valid_events,
        "unmatched_creation_events": unassigned_events,
        "issues_without_creation_event": sum(1 for row in issue_rows if int(row["id"]) not in recorded_creation_ids),
        "system_outlook": system_outlook[:10],
        "risk_signals": signals[:12],
        "open_critical": critical_open,
        "open_high": high_open,
        "methodology": "Deterministic 7-day linear trend continuation, exact normalized-title recurrence signals, and current open severity counts. Not machine learning, a failure probability, or an SLA forecast.",
        "limitations": "Only valid Issue created audit events matched to existing issue IDs are counted. Sparse history, missing audit events, seasonality, changes in workload, and external system telemetry are not modeled.",
    }


@app.get("/api/alert-rules")
def get_alert_rules(user=Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT rule_key, name, description, is_enabled, updated_at FROM alert_rules ORDER BY rule_key"
        ).fetchall()
    return [{**dict(row), "is_enabled": bool(row["is_enabled"])} for row in rows]


class AlertRuleUpdate(BaseModel):
    is_enabled: bool


@app.patch("/api/alert-rules/{rule_key}")
def update_alert_rule(rule_key: str, payload: AlertRuleUpdate, user=Depends(require_roles("Admin"))):
    with get_connection() as conn:
        row = conn.execute("SELECT rule_key FROM alert_rules WHERE rule_key = ?", (rule_key,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Alert rule not found.")
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE alert_rules SET is_enabled = ?, updated_at = ? WHERE rule_key = ?",
            (1 if payload.is_enabled else 0, now, rule_key),
        )
    log_activity("Alert rule updated", f"Alert rule '{rule_key}' enabled={payload.is_enabled}.", "AlertRule", None)
    return {"rule_key": rule_key, "is_enabled": payload.is_enabled}


@app.post("/api/alerts/evaluate")
def evaluate_alert_rules(user=Depends(require_roles("Admin", "Developer"))):
    """Evaluate saved issue state and deterministic forecast signals into deduplicated in-app alerts."""
    forecast = get_incident_forecast(user)
    with get_connection() as conn:
        enabled = {row["rule_key"] for row in conn.execute(
            "SELECT rule_key FROM alert_rules WHERE is_enabled = 1"
        ).fetchall()}
        issue_rows = conn.execute(
            "SELECT id, title, system, severity, description, status FROM issues WHERE status = 'Open'"
        ).fetchall()
        prior_fingerprints = {row["fingerprint"] for row in conn.execute("SELECT fingerprint FROM alert_events").fetchall()}
        active = {}
        if "critical_high_issues" in enabled:
            for row in issue_rows:
                if row["severity"] not in ("Critical", "High"):
                    continue
                fingerprint = f"issue:{int(row['id'])}:severity:{row['severity']}"
                active[fingerprint] = {
                    "source_type": "Issue", "source_id": str(row["id"]),
                    "title": row["title"], "system": row["system"],
                    "severity": row["severity"], "description": row["description"],
                    "evidence": [{"issue_id": int(row["id"]), "severity": row["severity"], "status": row["status"]}],
                }
        for signal in forecast.get("risk_signals", []):
            signal_type = signal.get("type")
            if signal_type == "Recurring open signature" and "recurring_open_signatures" not in enabled:
                continue
            if signal_type == "Rising incident volume" and "rising_incident_volume" not in enabled:
                continue
            if signal_type not in ("Recurring open signature", "Rising incident volume"):
                continue
            fingerprint = f"signal:{signal_type.lower().replace(' ', '_')}:{str(signal.get('system', 'unknown')).lower()}"
            active[fingerprint] = {
                "source_type": "Intelligence signal", "source_id": None,
                "title": signal_type, "system": signal.get("system", "Unspecified"),
                "severity": signal.get("severity", "Medium"), "description": signal.get("detail", ""),
                "evidence": [{"issue_ids": signal.get("issue_ids", []), "evidence_count": signal.get("evidence_count", 0)}],
            }
        now = datetime.now(timezone.utc).isoformat()
        for fingerprint, item in active.items():
            conn.execute(
                """INSERT INTO alert_events
                (fingerprint, source_type, source_id, title, system, severity, description, evidence_json, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)
                ON CONFLICT(fingerprint) DO UPDATE SET
                  source_type=excluded.source_type, source_id=excluded.source_id, title=excluded.title,
                  system=excluded.system, severity=excluded.severity, description=excluded.description,
                  evidence_json=excluded.evidence_json,
                  status=CASE WHEN alert_events.status = 'Resolved' AND alert_events.resolution_reason = 'manual' THEN 'Resolved' WHEN alert_events.status = 'Resolved' THEN 'Open' ELSE alert_events.status END,
                  updated_at=excluded.updated_at,
                  resolved_at=CASE WHEN alert_events.status = 'Resolved' AND alert_events.resolution_reason = 'manual' THEN alert_events.resolved_at ELSE NULL END,
                  resolution_reason=CASE WHEN alert_events.status = 'Resolved' AND alert_events.resolution_reason = 'manual' THEN 'manual' ELSE NULL END""",
                (fingerprint, item["source_type"], item["source_id"], item["title"], item["system"],
                 item["severity"], item["description"], json.dumps(item["evidence"]), now, now),
            )
        existing_alerts = conn.execute("SELECT fingerprint FROM alert_events").fetchall()
        for existing in existing_alerts:
            if existing["fingerprint"] not in active:
                conn.execute(
                    "UPDATE alert_events SET status='Resolved', resolved_at=COALESCE(resolved_at, ?), updated_at=?, resolution_reason='condition_cleared' WHERE fingerprint=?",
                    (now, now, existing["fingerprint"]),
                )
        new_alert_rows = []
        for fingerprint in active.keys() - prior_fingerprints:
            alert_row = conn.execute("SELECT * FROM alert_events WHERE fingerprint=?", (fingerprint,)).fetchone()
            if alert_row is not None:
                new_alert_rows.append(dict(alert_row))
        count = len(active)
    for alert_row in new_alert_rows:
        deliver_alert_webhooks(alert_row)
    log_activity("Alert evaluation completed", f"Evaluated alert rules; {count} active condition(s) matched; {len(new_alert_rows)} new alert(s) queued for webhook delivery.", "Alert", None)
    return {"evaluated_at": now, "active_conditions": count, "message": "Alert rules evaluated."}


@app.get("/api/alerts")
def get_alerts(user=Depends(get_current_user)):
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, fingerprint, source_type, source_id, title, system, severity, description,
                      evidence_json, status, created_at, updated_at, acknowledged_by, acknowledged_at, resolved_at
               FROM alert_events ORDER BY
                 CASE status WHEN 'Open' THEN 0 WHEN 'Acknowledged' THEN 1 ELSE 2 END,
                 CASE severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 ELSE 2 END, id DESC
               LIMIT 500"""
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        try:
            item["evidence"] = json.loads(item.pop("evidence_json") or "[]")
        except (TypeError, ValueError):
            item["evidence"] = []
            item.pop("evidence_json", None)
        result.append(item)
    return result


class AlertStatusUpdate(BaseModel):
    status: str


@app.patch("/api/alerts/{alert_id}/status")
def update_alert_status(alert_id: int, payload: AlertStatusUpdate, user=Depends(require_roles("Admin", "Developer"))):
    if payload.status not in ("Acknowledged", "Resolved"):
        raise HTTPException(status_code=400, detail="Status must be Acknowledged or Resolved.")
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        row = conn.execute("SELECT id, status FROM alert_events WHERE id = ?", (alert_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Alert not found.")
        if row["status"] == "Resolved" and payload.status == "Acknowledged":
            raise HTTPException(status_code=409, detail="A resolved alert cannot be acknowledged.")
        if payload.status == "Acknowledged":
            conn.execute(
                "UPDATE alert_events SET status='Acknowledged', acknowledged_by=?, acknowledged_at=?, updated_at=?, resolution_reason=NULL WHERE id=?",
                (user["email"], now, now, alert_id),
            )
        else:
            conn.execute(
                "UPDATE alert_events SET status='Resolved', resolved_at=?, updated_at=?, resolution_reason='manual' WHERE id=?",
                (now, now, alert_id),
            )
    log_activity(f"Alert {payload.status.lower()}", f"Alert #{alert_id} was {payload.status.lower()} by {user['email']}.", "Alert", alert_id)
    return {"id": alert_id, "status": payload.status, "updated_at": now}


# Compatibility endpoint retained for clients from the previous alert-center version.
@app.patch("/api/alerts/{issue_id}/read")
def mark_alert_read(issue_id: int, user=Depends(require_roles("Admin", "Developer"))):
    with get_connection() as conn:
        row = conn.execute("SELECT id FROM alert_events WHERE source_type='Issue' AND source_id=? AND status='Open' ORDER BY id DESC LIMIT 1", (str(issue_id),)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Active alert not found.")
    return update_alert_status(int(row["id"]), AlertStatusUpdate(status="Acknowledged"), user)
