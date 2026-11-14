# NEXORA AI — Phase 12: Final Security, Performance & Production Readiness

## Included files
- `backend/main.py`

The frontend is unchanged in this phase. Existing System Health and Integration Observability screens continue to use the current API contracts.

## Changes

### Security hardening
- Production startup now fails closed if `NEXORA_SECRET_KEY` is the development default or shorter than 32 characters.
- Production startup rejects wildcard, empty, or non-HTTPS CORS origin configuration. Configure only the exact HTTPS origin(s) of the deployed frontend.
- CORS methods and request headers are explicitly allow-listed.
- API responses include `Cache-Control: no-store` to prevent caching of authenticated operational data and session responses.
- Responses include request IDs, response-time metadata, and security headers (`nosniff`, frame denial, strict referrer policy, and a restrictive permissions policy). HSTS is emitted in production; TLS must still be terminated correctly by the deployment proxy.
- Request bodies declaring more than 2 MB are rejected with HTTP 413.
- Process-local rolling-window rate limits protect login, bootstrap registration, log analysis, and alert evaluation endpoints. `Retry-After` is returned on HTTP 429.
- The readiness endpoint no longer exposes environment names or filesystem details and reports configuration checks without returning secret values.

### Authentication and data integrity
- Bootstrap registration now uses a SQLite `BEGIN IMMEDIATE` transaction. Concurrent first-registration attempts cannot create multiple bootstrap administrators.
- Expired authentication sessions are pruned during successful login.
- SQLite connections use a 10-second busy timeout and explicitly enable foreign-key enforcement.
- Added idempotent indexes for common issue, audit, alert, and session-expiry queries.
- Removed a duplicate legacy alert-read route; the retained compatibility endpoint acknowledges the corresponding alert-event record consistently.
- Backend version metadata updated to 1.6.1.

## Validation performed
- Python syntax compilation passed.
- Isolated FastAPI tests using a temporary SQLite database passed:
  - health and readiness responses, request IDs, security headers, and no-store behavior;
  - readiness does not disclose the development secret or environment value;
  - concurrent bootstrap registration yields exactly one successful Admin creation;
  - login, authenticated session, and role-protected user listing;
  - oversized request rejection;
  - login rate limiting and HTTP 429 response;
  - SQLite foreign-key enforcement and expected indexes;
  - duplicate compatibility route removed;
  - valid production configuration starts and reports ready;
  - production startup rejects weak/default secrets and wildcard CORS.
- Tests used isolated temporary database files. The existing `backend/nexora.db` was not used or modified.

## Deployment configuration

Set these server-side environment variables before starting the backend:

```powershell
$env:NEXORA_ENV = "production"
$env:NEXORA_SECRET_KEY = "<unique-random-secret-at-least-32-characters>"
$env:NEXORA_CORS_ORIGINS = "https://your-frontend.example.com"
$env:NEXORA_DB_PATH = "<persistent-volume-path>\nexora.db"
```

Generate a secret locally with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Do not put the secret in frontend code, `NEXT_PUBLIC_*` variables, source control, or client-visible configuration. Store it in the deployment platform's secret manager.

## Operational limitations and production checklist
- The built-in rate limiter is process-local. Use a shared API gateway/reverse-proxy rate limiter when running multiple workers or replicas.
- Deploy behind HTTPS with a trusted reverse proxy. HSTS is not a substitute for TLS configuration.
- Persist the directory containing `NEXORA_DB_PATH`; do not store the production database in an ephemeral container layer.
- Take and verify backups before upgrades. The Admin database-backup endpoint creates a consistent SQLite snapshot.
- Run the readiness endpoint after configuration and confirm `status: ready`.
- Keep outbound network egress restrictions enabled for webhook delivery. Application-level URL validation does not replace network-level SSRF controls.
- Phase 11 webhook delivery remains synchronous and bounded; this phase does not introduce a durable background queue or claim high-availability delivery.
- This phase does not claim external uptime monitoring, SLA compliance, distributed tracing, or automatic production remediation.

## Database safety
- No database file is included.
- No tables or columns are dropped or rewritten.
- New indexes use `CREATE INDEX IF NOT EXISTS`.
- Existing users, issues, alerts, integrations, workflow history, and audit records are preserved.
