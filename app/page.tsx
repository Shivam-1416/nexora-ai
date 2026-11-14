
"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "Critical" | "High" | "Medium";
type Status = "Open" | "Approved" | "Dismissed";
type UserRole = "Admin" | "Developer" | "Viewer";
type ManagedUser = {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

type Integration = {
  id: number;
  provider: string;
  display_name: string;
  endpoint_url: string | null;
  webhook_url?: string | null;
  webhook_enabled?: boolean;
  delivery_count?: number;
  last_success_at?: string | null;
  status: string;
  created_at: string;
};

type IntegrationObservability = {
  summary: { total: number; delivered: number; failed: number; pending: number };
  recent_deliveries: Array<{
    id: number; integration_id: number; display_name: string; alert_id: number | null;
    event_type: string; status: string; attempt_count: number; response_code: number | null;
    error_message: string | null; created_at: string; updated_at: string; delivered_at: string | null;
  }>;
  delivery_semantics: string;
};

type AuditLog = {
  id: number;
  action: string;
  details: string;
  entity_type: string;
  entity_id: number | null;
  created_at: string;
};

type FixRecommendation = {
  id: number;
  issue_id: number;
  title: string;
  rationale: string;
  before_text: string;
  after_text: string;
  steps: string;
  status: "Proposed" | "Approved" | "Rejected" | "Prepared" | "Simulated" | "Rolled Back";
  created_at: string;
  updated_at: string;
  created_by_email?: string | null;
  approved_by_email?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  issue_title?: string;
  issue_system?: string;
  issue_severity?: Severity;
};

type LogDiagnostic = {
  issue_id: number;
  line_number: number;
  level: string;
  timestamp: string | null;
  category: string;
  matched_rule: string;
  matched_text: string;
  evidence: string;
  confidence: string;
  additional_matches: string[];
};

type LogAnalysisSummary = {
  total_lines: number;
  nonempty_lines: number;
  matched_lines: number;
  unmatched_lines: number;
  unprocessed_lines: number;
  truncated: boolean;
  severity_counts: Record<string, number>;
  category_counts: Record<string, number>;
  diagnostics: LogDiagnostic[];
};

type RootCauseReport = {
  id: number; issue_id: number; probable_cause: string; evidence: string[];
  impact: string; confidence: string; recommended_actions: string;
  category: string; created_at: string; issue_title?: string;
  issue_system?: string; issue_severity?: Severity;
};

type CorrelationGroup = {
  group_id: string; category: string; count: number; summary: string; suggested_focus: string;
  confidence: string; correlation_score: number; shared_signals: string[];
  relationships: { issue_ids: number[]; score: number; shared_signals: string[] }[];
  issues: { id: number; title: string; system: string; severity: Severity; status: Status;
    diagnostic_score: number; diagnostic_confidence: string; evidence: string[] }[];
};

type Issue = {
  id: number;
  title: string;
  system: string;
  severity: Severity;
  status: Status;
  description: string;
  cause: string;
  recommendation: string;
};

type IssueHistoryEvent = {
  id: number;
  action: string;
  details: string;
  entity_type: string;
  entity_id: number | null;
  created_at: string;
};

type IssueHistoryResponse = {
  issue_id: number;
  issue_title: string;
  events: IssueHistoryEvent[];
  total_returned: number;
  truncated: boolean;
  coverage_note: string;
};

type ReliabilitySnapshot = {
  score: number;
  rating: string;
  checked_at: string;
  dimensions: Record<string, { score: number; weight_percent: number; status: string; detail: string }>;
  open_incidents: { total: number; by_severity: Record<string, number>; older_than_7_days: number; known_age: number; unknown_age: number };
  findings: { severity: string; title: string; detail: string }[];
  methodology: { note: string };
};

type SystemOverview = {
  application: string;
  version: string;
  environment: string;
  checked_at: string;
  database: {
    connected: boolean;
    file_name: string;
    size_bytes: number;
  };
  records: Record<string, number>;
  capabilities: Record<string, string | number | boolean | null>;
  reliability?: ReliabilitySnapshot;
};

type FixExecution = {
  id: number;
  fix_id: number;
  issue_id: number;
  status: string;
  details: string;
  action: string;
  actor_email: string;
  created_at: string;
};

type SeverityBreakdown = {
  severity: string;
  count: number;
};

type StatusBreakdown = {
  status: string;
  count: number;
};

type SystemBreakdown = {
  system: string;
  count: number;
};

type ReportSummary = {
  generated_at: string;
  total_issues: number;
  open_issues: number;
  severity_breakdown: SeverityBreakdown[];
  status_breakdown: StatusBreakdown[];
  system_breakdown: SystemBreakdown[];
  recent_issues: Issue[];
};

type IntelligenceTrends = {
  generated_at: string;
  trend_window_days: number;
  issue_creation_trend: { date: string; count: number }[];
  trend_source: string;
  trend_events_counted: number;
  issues_without_creation_audit_event: number;
  recurring_incidents: { system: string; title: string; occurrences: number; open_occurrences: number; issue_ids: number[]; latest_issue_id: number; signal: string }[];
  priority_queue: { id: number; title: string; system: string; severity: Severity; status: Status; priority_score: number; recurrence_count: number; reasons: string[] }[];
  open_issue_aging: {
    bucket_counts: Record<string, number>;
    issues_with_verified_age: number;
    open_issues_without_creation_audit_event: number;
    oldest_open_issues: { id: number; title: string; system: string; severity: Severity; age_hours: number; age_days: number; age_bucket: string; created_at: string }[];
    source: string;
    limitations: string;
  };
  priority_method: string;
};

type IncidentForecast = {
  generated_at: string;
  comparison_window_days: number;
  previous_7_days: number;
  recent_7_days: number;
  change: number;
  direction: string;
  projected_next_7_days: number | null;
  confidence: string;
  confidence_note: string;
  valid_creation_events: number;
  unmatched_creation_events: number;
  issues_without_creation_event: number;
  system_outlook: { system: string; previous_7_days: number; recent_7_days: number; change: number; direction: string; projected_next_7_days: number; method: string }[];
  risk_signals: { type: string; severity: string; system: string; detail: string; issue_ids: number[]; evidence_count: number }[];
  open_critical: number;
  open_high: number;
  methodology: string;
  limitations: string;
};

type Alert = {
  id: number;
  fingerprint: string;
  source_type: string;
  source_id: string | null;
  severity: Severity;
  title: string;
  system: string;
  description: string;
  evidence: Array<{ issue_id?: number; issue_ids?: number[]; evidence_count?: number; severity?: string; status?: string }>;
  status: "Open" | "Acknowledged" | "Resolved";
  created_at: string;
  updated_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

type AlertRule = {
  rule_key: string;
  name: string;
  description: string;
  is_enabled: boolean;
  updated_at: string;
};

type Notice = {
  type: "success" | "error" | "info";
  text: string;
};

type IssueForm = {
  title: string;
  system: string;
  severity: Severity;
  description: string;
  cause: string;
  recommendation: string;
};

const emptyForm: IssueForm = {
  title: "",
  system: "",
  severity: "Medium",
  description: "",
  cause: "",
  recommendation: "",
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("nexora_token") : null;
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

const initialIssues: Issue[] = [
  {
    id: 1,
    title: "API response timeout",
    system: "Backend / API",
    severity: "Critical",
    status: "Open",
    description: "An API request takes too long to return a response.",
    cause: "A slow database query, external service, or blocked operation may be responsible.",
    recommendation: "Inspect application logs, measure request duration, and test the API dependency before changing production code.",
  },
  {
    id: 2,
    title: "Database connection warning",
    system: "Database",
    severity: "High",
    status: "Open",
    description: "The application may be experiencing problems connecting to its database.",
    cause: "Possible causes include incorrect connection settings, network problems, or an exhausted connection pool.",
    recommendation: "Check database logs, connection settings, and connection-pool usage. Verify the fix in a test environment.",
  },
  {
    id: 3,
    title: "Invalid input validation",
    system: "Web Application",
    severity: "Medium",
    status: "Open",
    description: "The application may accept data that does not match its expected format.",
    cause: "A missing or incomplete validation rule could allow invalid input.",
    recommendation: "Review the input validation rules and add tests for valid, invalid, and unexpected values.",
  },
  {
    id: 4,
    title: "Repeated login failures",
    system: "Authentication",
    severity: "High",
    status: "Approved",
    description: "Repeated failed login attempts have been reported in this sample dataset.",
    cause: "Possible causes include incorrect credentials, expired sessions, or automated login attempts.",
    recommendation: "Review authentication logs and apply appropriate account-protection controls.",
  },
  {
    id: 5,
    title: "Slow dashboard loading",
    system: "Frontend",
    severity: "Medium",
    status: "Dismissed",
    description: "The dashboard takes longer than expected to render.",
    cause: "Large assets, excessive network requests, or expensive rendering may contribute.",
    recommendation: "Measure page performance before optimizing assets or changing rendering behavior.",
  },
];

const navItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Issue Monitor", icon: "⌕" },
  { name: "Approval Center", icon: "✓" },
  { name: "Fix Center", icon: "⚒" },
  { name: "Execution History", icon: "↻" },
  { name: "Root Cause & Correlation", icon: "⌁" },
  { name: "Log Analyzer", icon: "⌁" },
  { name: "Reports", icon: "▤" },
  { name: "Alert Center", icon: "♢" },
  { name: "Audit Logs", icon: "◷" },
  { name: "System Health", icon: "⌁" },
  { name: "Integrations", icon: "⌘" },
  { name: "User Management", icon: "♙" },
  { name: "Settings", icon: "⚙" },
];

const severityClass: Record<Severity, string> = {
  Critical: "bg-rose-400/10 text-rose-300",
  High: "bg-amber-400/10 text-amber-300",
  Medium: "bg-blue-400/10 text-blue-300",
};

const statusClass: Record<Status, string> = {
  Open: "bg-rose-400/10 text-rose-300",
  Approved: "bg-emerald-400/10 text-emerald-300",
  Dismissed: "bg-slate-400/10 text-slate-300",
};

export default function Home() {
  const [authUser, setAuthUser] = useState<{id:number; email:string; full_name:string; role:string} | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [creatingManagedUser, setCreatingManagedUser] = useState(false);
  const [updatingManagedUserId, setUpdatingManagedUserId] = useState<number | null>(null);
  const [managedUserForm, setManagedUserForm] = useState({ full_name: "", email: "", password: "", role: "Viewer" as UserRole });
  const [showAddForm, setShowAddForm] = useState(false);
const [newIssue, setNewIssue] = useState<IssueForm>(emptyForm);
const [creatingIssue, setCreatingIssue] = useState(false);
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [historyIssueId, setHistoryIssueId] = useState<number | null>(null);
  const [issueHistory, setIssueHistory] = useState<IssueHistoryResponse | null>(null);
  const [loadingIssueHistory, setLoadingIssueHistory] = useState(false);
  const [issueHistoryError, setIssueHistoryError] = useState("");

  const [loadingIssues, setLoadingIssues] = useState(true);
  const [updatingIssueId, setUpdatingIssueId] = useState<number | null>(null);
  const [apiError, setApiError] = useState("");
  const [systemOverview, setSystemOverview] = useState<SystemOverview | null>(null);
  const [loadingSystemOverview, setLoadingSystemOverview] = useState(false);
  const [systemOverviewError, setSystemOverviewError] = useState("");
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  const [notice, setNotice] = useState<Notice | null>(null);

  // Log Analyzer state
  const [logText, setLogText] = useState("");
  const [logSystem, setLogSystem] = useState("Application Logs");
  const [analyzingLogs, setAnalyzingLogs] = useState(false);
  const [logResults, setLogResults] = useState<Issue[]>([]);
  const [logAnalysisSummary, setLogAnalysisSummary] = useState<LogAnalysisSummary | null>(null);
  const [logAnalysisComplete, setLogAnalysisComplete] = useState(false);

  // Audit history state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditLogError, setAuditLogError] = useState("");

  // Integration registry state
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [integrationProvider, setIntegrationProvider] = useState("GitHub");
  const [integrationName, setIntegrationName] = useState("");
  const [integrationUrl, setIntegrationUrl] = useState("");
  const [integrationWebhookUrl, setIntegrationWebhookUrl] = useState("");
  const [integrationObservability, setIntegrationObservability] = useState<IntegrationObservability | null>(null);
  const [testingIntegrationId, setTestingIntegrationId] = useState<number | null>(null);
  const [savingIntegration, setSavingIntegration] = useState(false);

  // Fix recommendation and approval workflow
  const [fixes, setFixes] = useState<FixRecommendation[]>([]);
  const [loadingFixes, setLoadingFixes] = useState(false);
  const [generatingFixFor, setGeneratingFixFor] = useState<number | null>(null);
  const [updatingFixId, setUpdatingFixId] = useState<number | null>(null);
  const [fixExecutions, setFixExecutions] = useState<FixExecution[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(false);

  // Root-cause analysis and issue-correlation state
  const [rootCauseReports, setRootCauseReports] = useState<RootCauseReport[]>([]);
  const [correlationGroups, setCorrelationGroups] = useState<CorrelationGroup[]>([]);
  const [loadingRootCause, setLoadingRootCause] = useState(false);
  const [analyzingIssueId, setAnalyzingIssueId] = useState<number | null>(null);
  const [correlationCount, setCorrelationCount] = useState(0);

  // Reporting and alert center
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [intelligenceTrends, setIntelligenceTrends] = useState<IntelligenceTrends | null>(null);
  const [incidentForecast, setIncidentForecast] = useState<IncidentForecast | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [updatingAlertId, setUpdatingAlertId] = useState<number | null>(null);
  const [updatingAlertRule, setUpdatingAlertRule] = useState<string | null>(null);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true); setAuthMessage("");
    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = authMode === "register"
        ? { email: authEmail, full_name: authName, password: authPassword, role: "Admin" }
        : { email: authEmail, password: authPassword };
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Authentication failed.");
      localStorage.setItem("nexora_token", data.access_token);
      setAuthUser(data.user); setAuthPassword(""); setAuthMessage("");
      window.location.reload();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    try { await apiFetch(`${API_URL}/api/auth/logout`, { method: "POST" }); } catch {}
    localStorage.removeItem("nexora_token"); setAuthUser(null); setAuthReady(true);
  }

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("nexora_token");

    if (!token) {
      void Promise.resolve().then(() => {
        if (!cancelled) setAuthReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The saved session is no longer valid.");
        return response.json();
      })
      .then((user: { id: number; email: string; full_name: string; role: string }) => {
        if (!cancelled) setAuthUser(user);
      })
      .catch(() => {
        localStorage.removeItem("nexora_token");
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load issues from the backend when the page opens.
  useEffect(() => {
    let cancelled = false;

    async function fetchIssues() {
      try {
        const response = await apiFetch(`${API_URL}/api/issues`);

        if (!response.ok) {
          throw new Error("The backend could not load the issues.");
        }

        const data = await response.json();

const issueList: Issue[] = Array.isArray(data)
  ? data
  : data.issues;

if (!Array.isArray(issueList)) {
  throw new Error("The backend returned an invalid response.");
}

if (!cancelled) {
  setIssues(issueList);
  setApiError("");
}
      } catch {
        if (!cancelled) {
          setApiError(
            "Backend unavailable. Showing fallback sample data instead."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingIssues(false);
        }
      }
    }

    fetchIssues();


  return () => {
      cancelled = true;
    };
  }, []);

  async function loadIssueHistory(issueId: number) {
    setHistoryIssueId(issueId);
    setIssueHistory(null);
    setIssueHistoryError("");
    setLoadingIssueHistory(true);
    try {
      const response = await apiFetch(`${API_URL}/api/issues/${issueId}/history`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load issue history.");
      if (!Array.isArray(data.events)) throw new Error("The issue history response is invalid.");
      setIssueHistory(data as IssueHistoryResponse);
    } catch (error) {
      setIssueHistoryError(error instanceof Error ? error.message : "Issue history is unavailable.");
    } finally {
      setLoadingIssueHistory(false);
    }
  }

  async function loadAuditLogs() {
    try {
      const response = await apiFetch(`${API_URL}/api/audit-logs?limit=200`);
      if (!response.ok) throw new Error("Could not load activity history.");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid audit log response.");
      setAuditLogError("");
      setAuditLogs(data);
    } catch (error) {
      setAuditLogError(error instanceof Error ? error.message : "Audit history is unavailable.");
    } finally {
      setLoadingAuditLogs(false);
    }
  }

  useEffect(() => {
    if (activePage === "Audit Logs") {
      queueMicrotask(() => { void loadAuditLogs(); });
    }
  }, [activePage]);

  async function loadManagedUsers() {
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load user directory.");
      if (!Array.isArray(data)) throw new Error("The user directory returned an invalid response.");
      setManagedUsers(data);
      setUsersError("");
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "User directory is unavailable.");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (activePage === "User Management" && authUser?.role === "Admin") {
      queueMicrotask(() => { void loadManagedUsers(); });
    }
  }, [activePage, authUser?.role]);

  async function createManagedUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingManagedUser) return;
    setCreatingManagedUser(true);
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(managedUserForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create user.");
      setManagedUsers((current) => [...current, data].sort((a, b) => a.id - b.id));
      setManagedUserForm({ full_name: "", email: "", password: "", role: "Viewer" });
      setNotice({ type: "success", text: `Account created for ${data.email}.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not create user." });
    } finally {
      setCreatingManagedUser(false);
    }
  }

  async function updateManagedUserRole(target: ManagedUser, role: UserRole) {
    if (target.role === role) return;
    setUpdatingManagedUserId(target.id);
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users/${target.id}/role?role=${encodeURIComponent(role)}`, { method: "PATCH" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update user role.");
      setManagedUsers((current) => current.map((item) => item.id === target.id ? { ...item, role } : item));
      setNotice({ type: "success", text: `${target.email} is now assigned the ${role} role.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update user role." });
    } finally {
      setUpdatingManagedUserId(null);
    }
  }

  async function updateManagedUserStatus(target: ManagedUser) {
    const nextStatus = !target.is_active;
    setUpdatingManagedUserId(target.id);
    try {
      const response = await apiFetch(`${API_URL}/api/auth/users/${target.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update account status.");
      setManagedUsers((current) => current.map((item) => item.id === target.id ? { ...item, is_active: nextStatus } : item));
      setNotice({ type: "success", text: `${target.email} account ${nextStatus ? "activated" : "deactivated"}.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update account status." });
    } finally {
      setUpdatingManagedUserId(null);
    }
  }

  async function loadIntegrations() {
    try {
      const response = await apiFetch(`${API_URL}/api/integrations`);
      if (!response.ok) throw new Error("Could not load integrations.");
      const data = await response.json();
      setIntegrations(Array.isArray(data) ? data : []);
      const observabilityResponse = await apiFetch(`${API_URL}/api/integrations/observability`);
      if (observabilityResponse.ok) setIntegrationObservability(await observabilityResponse.json());
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Integration registry unavailable." });
    } finally {
      setLoadingIntegrations(false);
    }
  }

  useEffect(() => {
    if (activePage === "Integrations") {
      queueMicrotask(() => { void loadIntegrations(); });
    }
  }, [activePage]);

  async function saveIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingIntegration) return;
    setSavingIntegration(true);
    try {
      const response = await apiFetch(`${API_URL}/api/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: integrationProvider, display_name: integrationName, endpoint_url: integrationUrl || null, webhook_url: integrationWebhookUrl || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not save integration.");
      setIntegrations((current) => [data.integration, ...current]);
      setIntegrationName("");
      setIntegrationUrl("");
      setIntegrationWebhookUrl("");
      setNotice({ type: "success", text: data.integration.webhook_enabled ? "Integration saved. Webhook delivery is enabled; configure NEXORA_SECRET_KEY before sending signed events." : "Integration registry entry saved. No webhook delivery is enabled." });
      void loadIntegrations();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save integration." });
    } finally {
      setSavingIntegration(false);
    }
  }

  async function testIntegrationWebhook(id: number) {
    if (testingIntegrationId !== null) return;
    setTestingIntegrationId(id);
    try {
      const response = await apiFetch(`${API_URL}/api/integrations/${id}/test`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Webhook test failed.");
      setNotice({ type: "success", text: `Webhook test delivered (HTTP ${data.response_code}).` });
      await loadIntegrations();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Webhook test failed." });
      await loadIntegrations();
    } finally {
      setTestingIntegrationId(null);
    }
  }

  async function removeIntegration(id: number) {
    try {
      const response = await apiFetch(`${API_URL}/api/integrations/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not remove integration.");
      setIntegrations((current) => current.filter((item) => item.id !== id));
      setNotice({ type: "success", text: "Integration configuration removed." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove integration." });
    }
  }

  async function loadSystemOverview() {
    try {
      const response = await apiFetch(`${API_URL}/api/system/overview`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load system health.");
      const reliabilityResponse = await apiFetch(`${API_URL}/api/system/reliability`);
      const reliabilityData = await reliabilityResponse.json();
      if (!reliabilityResponse.ok) throw new Error(reliabilityData.detail || "Could not load reliability insights.");
      setSystemOverviewError("");
      setSystemOverview({ ...data, reliability: reliabilityData });
    } catch (error) {
      setSystemOverviewError(error instanceof Error ? error.message : "Could not load system health.");
    } finally {
      setLoadingSystemOverview(false);
    }
  }

  async function downloadDatabaseBackup() {
    setDownloadingBackup(true);
    try {
      const response = await apiFetch(`${API_URL}/api/system/database-backup`);
      if (!response.ok) {
        let message = "Database backup download failed.";
        try {
          const data = await response.json();
          message = data.detail || message;
        } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "nexora-backup.db";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setNotice({ type: "success", text: "Database backup downloaded successfully." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Database backup download failed." });
    } finally {
      setDownloadingBackup(false);
    }
  }

  async function loadFixes() {
    try {
      const response = await apiFetch(`${API_URL}/api/fixes`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load fix recommendations.");
      setFixes(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Fix Center is unavailable." });
    } finally { setLoadingFixes(false); }
  }

  useEffect(() => {
    if (activePage === "Fix Center") {
      queueMicrotask(() => { void loadFixes(); });
    }
  }, [activePage]);

  useEffect(() => {
    if (activePage === "System Health") {
      queueMicrotask(() => { void loadSystemOverview(); });
    }
  }, [activePage]);

  async function generateFix(issueId: number) {
    setGeneratingFixFor(issueId);
    try {
      const response = await apiFetch(`${API_URL}/api/issues/${issueId}/fix-recommendations`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not generate recommendation.");
      setNotice({ type: "success", text: "Review recommendation generated. No source code or external system was changed." });
      setSelectedIssueId(null);
      changePage("Fix Center");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not generate recommendation." });
    } finally { setGeneratingFixFor(null); }
  }

  async function updateFix(fixId: number, status: "Approved" | "Rejected") {
    const rejectionReason = status === "Rejected" ? window.prompt("Enter the reason for rejecting this recommendation (at least 5 characters):") : null;
    if (status === "Rejected" && (!rejectionReason || rejectionReason.trim().length < 5)) {
      setNotice({ type: "error", text: "A rejection reason of at least 5 characters is required." });
      return;
    }
    setUpdatingFixId(fixId);
    try {
      const response = await apiFetch(`${API_URL}/api/fixes/${fixId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, rejection_reason: rejectionReason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update recommendation.");
      setFixes((current) => current.map((fix) => fix.id === fixId ? data.fix : fix));
      setNotice({ type: "success", text: `Recommendation ${status.toLowerCase()}.` });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update recommendation." }); }
    finally { setUpdatingFixId(null); }
  }

  async function prepareFix(fixId: number) {
    setUpdatingFixId(fixId);
    try {
      const response = await apiFetch(`${API_URL}/api/fixes/${fixId}/prepare`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not prepare recommendation.");
      setFixes((current) => current.map((fix) => fix.id === fixId ? data.fix : fix));
      setNotice({ type: "success", text: "Recommendation prepared. Apply and verify the change manually; no external system was modified." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not prepare recommendation." }); }
    finally { setUpdatingFixId(null); }
  }

  async function loadExecutionHistory() {
    try {
      const response = await apiFetch(`${API_URL}/api/fix-executions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load execution history.");
      setFixExecutions(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Execution history is unavailable." });
    } finally { setLoadingExecutions(false); }
  }

  async function simulateFix(fixId: number) {
    setUpdatingFixId(fixId);
    try {
      const response = await apiFetch(`${API_URL}/api/fixes/${fixId}/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "SIMULATE" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not simulate fix workflow.");
      setFixes(current => current.map(fix => fix.id === fixId ? data.fix : fix));
      setNotice({ type: "success", text: "Workflow simulation completed. No external system was modified." });
      setLoadingExecutions(true);
      await loadExecutionHistory();
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Simulation failed." }); }
    finally { setUpdatingFixId(null); }
  }

  async function rollbackSimulation(fixId: number) {
    setUpdatingFixId(fixId);
    try {
      const response = await apiFetch(`${API_URL}/api/fixes/${fixId}/rollback`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not roll back simulation.");
      setFixes(current => current.map(fix => fix.id === fixId ? data.fix : fix));
      setNotice({ type: "success", text: "Simulation marked rolled back. No external changes existed." });
      setLoadingExecutions(true);
      await loadExecutionHistory();
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Rollback failed." }); }
    finally { setUpdatingFixId(null); }
  }

  useEffect(() => {
    if (activePage === "Execution History") {
      queueMicrotask(() => { void loadExecutionHistory(); });
    }
  }, [activePage]);

  async function loadRootCauseData() {
    try {
      const [reportsResponse, correlationResponse] = await Promise.all([
        apiFetch(`${API_URL}/api/root-cause-reports`),
        apiFetch(`${API_URL}/api/issue-correlations`),
      ]);
      const reportsData = await reportsResponse.json();
      const correlationData = await correlationResponse.json();
      if (!reportsResponse.ok) throw new Error(reportsData.detail || "Could not load root-cause reports.");
      if (!correlationResponse.ok) throw new Error(correlationData.detail || "Could not load issue correlations.");
      setRootCauseReports(Array.isArray(reportsData) ? reportsData : []);
      setCorrelationGroups(Array.isArray(correlationData.groups) ? correlationData.groups : []);
      setCorrelationCount(Number(correlationData.total_issues_reviewed || 0));
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Root-cause analysis is unavailable." });
    } finally { setLoadingRootCause(false); }
  }

  useEffect(() => {
    if (activePage === "Root Cause & Correlation") {
      queueMicrotask(() => { void loadRootCauseData(); });
    }
  }, [activePage]);

  async function analyzeRootCause(issueId: number) {
    setAnalyzingIssueId(issueId);
    try {
      const response = await apiFetch(`${API_URL}/api/issues/${issueId}/root-cause`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not analyze this issue.");
      setRootCauseReports((current) => [data.report, ...current]);
      setNotice({ type: "success", text: "Root-cause report generated. Review the evidence and confidence before acting." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Analysis failed." });
    } finally { setAnalyzingIssueId(null); }
  }

  const selectedIssue =
    issues.find((issue) => issue.id === selectedIssueId) ?? null;

  const openIssues = issues.filter(
    (issue) => issue.status === "Open"
  ).length;

  const criticalIssues = issues.filter(
    (issue) => issue.status === "Open" && issue.severity === "Critical"
  ).length;

  const approvedIssues = issues.filter(
    (issue) => issue.status === "Approved"
  ).length;

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        issue.title.toLowerCase().includes(query) ||
        issue.system.toLowerCase().includes(query) ||
        issue.description.toLowerCase().includes(query);

      const matchesSeverity =
        severityFilter === "All" || issue.severity === severityFilter;

      const matchesStatus =
        statusFilter === "All" || issue.status === statusFilter;

      const matchesPage =
        activePage !== "Approval Center" || issue.status === "Open";

      return (
        matchesSearch &&
        matchesSeverity &&
        matchesStatus &&
        matchesPage
      );
    });
  }, [issues, search, severityFilter, statusFilter, activePage]);

  // Send approval or dismissal to FastAPI.
  async function updateIssue(id: number, status: Status) {
    if (updatingIssueId !== null) return;

    setUpdatingIssueId(id);
    setNotice(null);

    try {
      const response = await apiFetch(`${API_URL}/api/issues/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "The backend could not update this issue."
        );
      }

      if (!data.issue || data.issue.id !== id) {
        throw new Error("The backend returned an unexpected response.");
      }

      const updatedIssue = data.issue as Issue;

      setIssues((current) =>
        current.map((issue) =>
          issue.id === updatedIssue.id ? updatedIssue : issue
        )
      );

      setApiError("");
      setNotice({
        type: "success",
        text: `Success! "${updatedIssue.title}" has been ${status.toLowerCase()} successfully.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? `Update failed: ${error.message}`
            : "Update failed. Please check your backend connection.",
      });
    } finally {
      setUpdatingIssueId(null);
    }
  }
  async function createIssue(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (creatingIssue) return;

  setCreatingIssue(true);
  setNotice(null);

  try {
    const response = await apiFetch(`${API_URL}/api/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newIssue),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not create issue.");
    }

    const createdIssue: Issue = data.issue;

    setIssues((current) => [createdIssue, ...current]);
    setNewIssue(emptyForm);
    setShowAddForm(false);
    changePage("Issue Monitor");
    setSelectedIssueId(null);
    resetFilters();

    setNotice({
      type: "success",
      text: `Issue #${createdIssue.id} created successfully.`,
    });
  } catch (error) {
    setNotice({
      type: "error",
      text:
        error instanceof Error
          ? error.message
          : "Failed to create issue. Check backend connection.",
    });
  } finally {
    setCreatingIssue(false);
  }
}

  async function analyzeLogs(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!logText.trim()) {
      setNotice({ type: "error", text: "Paste application logs before analysis." });
      return;
    }

    setAnalyzingLogs(true);
    setLogResults([]);
    setLogAnalysisSummary(null);
    setLogAnalysisComplete(false);
    setNotice(null);

    try {
      const response = await apiFetch(`${API_URL}/api/analyze-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: logText, system: logSystem }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Log analysis failed."
        );
      }

      const detectedIssues: Issue[] = Array.isArray(data.issues) ? data.issues : [];
      setLogResults(detectedIssues);
      setLogAnalysisSummary({
        total_lines: Number(data.total_lines || 0),
        nonempty_lines: Number(data.nonempty_lines || 0),
        matched_lines: Number(data.matched_lines || 0),
        unmatched_lines: Number(data.unmatched_lines || 0),
        unprocessed_lines: Number(data.unprocessed_lines || 0),
        truncated: Boolean(data.truncated),
        severity_counts: data.severity_counts && typeof data.severity_counts === "object" ? data.severity_counts : {},
        category_counts: data.category_counts && typeof data.category_counts === "object" ? data.category_counts : {},
        diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics : [],
      });
      setLogAnalysisComplete(true);

      // Refresh the issue list so the Issue Monitor immediately shows saved findings.
      const issuesResponse = await apiFetch(`${API_URL}/api/issues`);
      if (issuesResponse.ok) {
        const allIssues = await issuesResponse.json();
        if (Array.isArray(allIssues)) setIssues(allIssues);
      }

      setNotice({
        type: "success",
        text: `Analysis completed. ${data.total_saved ?? detectedIssues.length} issue(s) saved to the Issue Monitor.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to analyze logs.",
      });
    } finally {
      setAnalyzingLogs(false);
    }
  }

  function changePage(page: string) {
    setActivePage(page);
    setSelectedIssueId(null);
    setHistoryIssueId(null);
    setIssueHistory(null);
    setIssueHistoryError("");
    setNotice(null);

    if (page === "Audit Logs") setLoadingAuditLogs(true);
    if (page === "Integrations") setLoadingIntegrations(true);
    if (page === "Fix Center") setLoadingFixes(true);
    if (page === "System Health") setLoadingSystemOverview(true);
    if (page === "Execution History") setLoadingExecutions(true);
    if (page === "Root Cause & Correlation") setLoadingRootCause(true);
    if (page === "Reports") setLoadingReport(true);
    if (page === "Alert Center") setLoadingAlerts(true);
    if (page === "User Management") setLoadingUsers(true);
  }

  function resetFilters() {
    setSearch("");
    setSeverityFilter("All");
    setStatusFilter("All");
  }

  function runDemoScan() {
    setNotice({
      type: "info",
      text: "Demo scan completed. These are sample issues; no real systems were scanned.",
    });
  }



  async function loadReportSummary() {
    try {
      const [response, intelligenceResponse, forecastResponse] = await Promise.all([
        apiFetch(`${API_URL}/api/reports/summary`),
        apiFetch(`${API_URL}/api/intelligence/trends`),
        apiFetch(`${API_URL}/api/intelligence/forecast`),
      ]);
      if (!response.ok) throw new Error("Could not generate report summary.");
      setReportSummary(await response.json());
      if (intelligenceResponse.ok) setIntelligenceTrends(await intelligenceResponse.json());
      if (forecastResponse.ok) setIncidentForecast(await forecastResponse.json());
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Report service unavailable." });
    } finally {
      setLoadingReport(false);
    }
  }

  async function loadAlerts() {
    try {
      if (authUser?.role === "Admin" || authUser?.role === "Developer") {
        const evaluation = await apiFetch(`${API_URL}/api/alerts/evaluate`, { method: "POST" });
        if (!evaluation.ok) {
          const data = await evaluation.json().catch(() => ({}));
          throw new Error(data.detail || "Could not evaluate alert rules.");
        }
      }
      const [response, rulesResponse] = await Promise.all([
        apiFetch(`${API_URL}/api/alerts`),
        apiFetch(`${API_URL}/api/alert-rules`),
      ]);
      if (!response.ok) throw new Error("Could not load alerts.");
      const data = await response.json();
      setAlerts(Array.isArray(data) ? data : []);
      if (rulesResponse.ok) {
        const rules = await rulesResponse.json();
        setAlertRules(Array.isArray(rules) ? rules : []);
      }
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Alert service unavailable." });
    } finally {
      setLoadingAlerts(false);
    }
  }

  async function updateAlertStatus(alertId: number, status: "Acknowledged" | "Resolved") {
    setUpdatingAlertId(alertId);
    try {
      const response = await apiFetch(`${API_URL}/api/alerts/${alertId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Could not ${status.toLowerCase()} alert.`);
      await loadAlerts();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update alert." });
    } finally {
      setUpdatingAlertId(null);
    }
  }

  async function toggleAlertRule(rule: AlertRule) {
    setUpdatingAlertRule(rule.rule_key);
    try {
      const response = await apiFetch(`${API_URL}/api/alert-rules/${rule.rule_key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: !rule.is_enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update alert rule.");
      setAlertRules((current) => current.map((item) => item.rule_key === rule.rule_key ? { ...item, is_enabled: data.is_enabled } : item));
      setNotice({ type: "success", text: `Alert rule ${data.is_enabled ? "enabled" : "disabled"}.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update alert rule." });
    } finally {
      setUpdatingAlertRule(null);
    }
  }


  function exportReportCsv() {
    if (!reportSummary) return;
    const rows: Array<Array<string | number | null | undefined>> = [
      ["Nexora AI Enterprise Issue Report"],
      ["Generated at", reportSummary.generated_at],
      ["Total issues", reportSummary.total_issues],
      ["Open issues", reportSummary.open_issues],
      [],
      ["Issue ID", "Title", "System", "Severity", "Status", "Description"],
      ...reportSummary.recent_issues.map((issue) => [
        issue.id,
        issue.title,
        issue.system,
        issue.severity,
        issue.status,
        issue.description,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nexora-issue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (activePage === "Reports") {
      queueMicrotask(() => { void loadReportSummary(); });
    }
    if (activePage === "Alert Center") {
      queueMicrotask(() => { void loadAlerts(); });
    }
  }, [activePage]);

  const noticeClass = notice
    ? {
        success:
          "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
        error: "border-rose-400/30 bg-rose-400/10 text-rose-200",
        info: "border-blue-400/30 bg-blue-400/10 text-blue-200",
      }[notice.type]
    : "";

  if (!authReady) {
    return <main className="min-h-screen bg-[#070b14] text-white flex items-center justify-center"><div className="text-sm text-slate-400">Loading Nexora AI secure session...</div></main>;
  }
  if (!authUser) {
    return (
      <main className="min-h-screen bg-[#070b14] text-white flex items-center justify-center px-5">
        <form onSubmit={submitAuth} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101827] p-8 shadow-2xl">
          <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">Nexora AI</div>
          <h1 className="mt-3 text-2xl font-semibold">{authMode === "login" ? "Welcome back" : "Create administrator account"}</h1>
          <p className="mt-2 text-sm text-slate-400">{authMode === "login" ? "Sign in to access Enterprise Intelligence." : "The first account becomes the initial administrator."}</p>
          {authMode === "register" && <label className="mt-5 block text-sm text-slate-300">Full name<input required minLength={2} value={authName} onChange={e=>setAuthName(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#080f1d] px-3 py-3 outline-none" /></label>}
          <label className="mt-4 block text-sm text-slate-300">Email<input required type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#080f1d] px-3 py-3 outline-none" /></label>
          <label className="mt-4 block text-sm text-slate-300">Password<input required minLength={authMode === "register" ? 10 : 1} type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#080f1d] px-3 py-3 outline-none" />{authMode === "register" && <span className="mt-1 block text-xs text-slate-500">At least 10 characters.</span>}</label>
          {authMessage && <p className="mt-4 rounded-lg bg-rose-400/10 p-3 text-sm text-rose-300">{authMessage}</p>}
          <button disabled={authBusy} className="mt-6 w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{authBusy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}</button>
          <button type="button" onClick={()=>{setAuthMode(authMode === "login" ? "register" : "login");setAuthMessage("");}} className="mt-4 w-full text-sm text-cyan-300">{authMode === "login" ? "First time? Create administrator account" : "Already have an account? Sign in"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1020] text-slate-100 md:flex">
      <div className="fixed right-5 top-4 z-50 flex items-center gap-3 rounded-xl border border-white/10 bg-[#101827]/95 px-3 py-2 text-xs shadow-lg">
        <span className="text-slate-300">{authUser.full_name} · {authUser.role}</span>
        <button onClick={signOut} className="text-cyan-300 hover:text-white">Sign out</button>
      </div>

      {/* Sidebar */}
      <aside className="w-full border-b border-white/10 bg-[#0e1528] p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold">
            N
          </div>
          <div>
            <h1 className="text-lg font-bold">Nexora AI</h1>
            <p className="text-xs text-slate-400">
              Enterprise Intelligence
            </p>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workspace
        </p>

        <nav className="flex flex-wrap gap-2 md:flex-col">
          {navItems.filter((item) => {
            if (item.name === "User Management" || item.name === "Integrations") return item.name !== "User Management" || authUser.role === "Admin";
            if (["Approval Center", "Log Analyzer", "Execution History", "System Health"].includes(item.name)) return authUser.role === "Admin" || authUser.role === "Developer";
            return true;
          }).map((item) => (
            <button
              key={item.name}
              onClick={() => changePage(item.name)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
                activePage === item.name
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span
              className={`h-2 w-2 rounded-full ${
                loadingIssues
                  ? "bg-blue-400"
                  : apiError
                    ? "bg-amber-400"
                    : "bg-emerald-400"
              }`}
            />
            {loadingIssues
              ? "Connecting..."
              : apiError
                ? "Backend unavailable"
                : "Backend connected"}
          </div>
          <p className="text-xs leading-5 text-slate-400">
            {apiError
              ? "Using fallback sample data."
              : "Connected to the FastAPI issue endpoint. AI analysis and external integrations are not configured."}
          </p>
        </div>

        <p className="mt-6 hidden text-xs leading-5 text-slate-500 md:block">
          Unified AI Enterprise
          <br />
          Debugging &amp; Automation
          <br />
          Prototype v1.1
        </p>
      </aside>

      {/* Main content */}
      <section className="min-w-0 flex-1 p-5 md:p-8">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-sm text-slate-400">
              Workspace / {activePage}
            </p>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              {selectedIssue
                ? "Issue Details"
                : activePage === "Dashboard"
                  ? "System Overview"
                  : activePage}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Monitor issues, investigate causes, and review proposed actions.
            </p>
          </div>

          <button
            onClick={runDemoScan}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            ↻ Run Demo Scan
          </button>
        </header>

        {/* Visible success, error, and information messages */}
        {notice && (
          <div
            role={notice.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm font-medium ${noticeClass}`}
          >
            <span className="text-lg">
              {notice.type === "success"
                ? "✓"
                : notice.type === "error"
                  ? "!"
                  : "i"}
            </span>
            <span className="flex-1">{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              className="rounded px-2 text-lg opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {loadingIssues && (
          <div className="mb-6 rounded-xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm text-blue-200">
            Loading issues from Nexora AI backend...
          </div>
        )}

        {apiError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200"
          >
            {apiError}
          </div>
        )}
        {showAddForm && (authUser.role === "Admin" || authUser.role === "Developer") && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#111a2e] p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">Add New Issue</h3>
          <p className="mt-1 text-sm text-slate-400">
            Enter the issue details below.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(false)}
          className="text-2xl text-slate-400 hover:text-white"
        >
          ×
        </button>
      </div>

      <form onSubmit={createIssue} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-slate-300">
            Issue Title
          </label>
          <input
            required
            minLength={3}
            value={newIssue.title}
            onChange={(e) =>
              setNewIssue({ ...newIssue, title: e.target.value })
            }
            placeholder="e.g. Payment processing failure"
            className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Department / System
            </label>
            <input
              required
              value={newIssue.system}
              onChange={(e) =>
                setNewIssue({ ...newIssue, system: e.target.value })
              }
              placeholder="e.g. Finance"
              className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Severity
            </label>
            <select
              value={newIssue.severity}
              onChange={(e) =>
                setNewIssue({
                  ...newIssue,
                  severity: e.target.value as Severity,
                })
              }
              className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </div>
        </div>

        {(
          [
            ["description", "Issue Description", "Describe the problem..."],
            ["cause", "Possible Cause", "What might be causing it?"],
            ["recommendation", "Recommended Solution", "Suggested next steps..."],
          ] as const
        ).map(([field, label, placeholder]) => (
          <div key={field}>
            <label className="mb-2 block text-sm text-slate-300">
              {label}
            </label>
            <textarea
              required
              rows={3}
              value={newIssue[field]}
              onChange={(e) =>
                setNewIssue({ ...newIssue, [field]: e.target.value })
              }
              placeholder={placeholder}
              className="w-full resize-y rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
        ))}

        <div className="flex flex-wrap justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={() => setShowAddForm(false)}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm hover:bg-white/5"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={creatingIssue}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {creatingIssue ? "Creating..." : "Create Issue"}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
        {/* Log Analyzer */}
        {activePage === "Log Analyzer" ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
              <div className="mb-5">
                <p className="text-sm font-semibold text-blue-300">LOG INTELLIGENCE</p>
                <h3 className="mt-2 text-xl font-bold">Analyze application logs</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Paste logs to detect known error patterns. Detected issues are saved
                  in the Nexora AI database for review.
                </p>
              </div>

              <form onSubmit={analyzeLogs} className="space-y-4">
                <div>
                  <label htmlFor="log-system" className="mb-2 block text-sm text-slate-300">
                    System / Department
                  </label>
                  <input
                    id="log-system"
                    value={logSystem}
                    onChange={(event) => setLogSystem(event.target.value)}
                    maxLength={100}
                    required
                    className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
                    placeholder="e.g. Payment Backend"
                  />
                </div>

                <div>
                  <label htmlFor="log-input" className="mb-2 block text-sm text-slate-300">
                    Application Logs
                  </label>
                  <textarea
                    id="log-input"
                    value={logText}
                    onChange={(event) => setLogText(event.target.value)}
                    required
                    rows={12}
                    maxLength={1000000}
                    className="w-full resize-y rounded-xl border border-white/10 bg-[#0b1020] p-4 font-mono text-sm outline-none placeholder:text-slate-600 focus:border-blue-500"
                    placeholder={"Paste logs here...\nERROR: API request timeout\nWARNING: Deprecated function\nCRITICAL: Out of memory"}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Maximum input size: 1 MB. Analysis currently uses predefined diagnostic rules.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={analyzingLogs}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analyzingLogs ? "Analyzing logs..." : "Analyze Logs"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogText("");
                      setLogResults([]);
                      setLogAnalysisSummary(null);
                      setLogAnalysisComplete(false);
                      setNotice(null);
                    }}
                    className="rounded-xl border border-white/10 px-5 py-3 text-sm hover:bg-white/5"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>

            {logAnalysisComplete && logAnalysisSummary && (
              <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-blue-300">DETERMINISTIC DIAGNOSTIC SUMMARY</p>
                    <h3 className="mt-1 text-lg font-semibold">Log analysis overview</h3>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">Rule-based · Evidence-linked</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Total lines", logAnalysisSummary.total_lines],
                    ["Non-empty", logAnalysisSummary.nonempty_lines],
                    ["Matched", logAnalysisSummary.matched_lines],
                    ["Unmatched", logAnalysisSummary.unmatched_lines],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Severity distribution</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(logAnalysisSummary.severity_counts).filter(([, count]) => count > 0).map(([severity, count]) => (
                        <span key={severity} className={`rounded-lg px-3 py-1.5 text-xs ${severityClass[severity as Severity] || "bg-white/10 text-slate-300"}`}>{severity}: {count}</span>
                      ))}
                      {Object.values(logAnalysisSummary.severity_counts).every((count) => count === 0) && <span className="text-xs text-slate-500">No matches</span>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Diagnostic categories</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(logAnalysisSummary.category_counts).map(([category, count]) => (
                        <span key={category} className="rounded-lg bg-blue-400/10 px-3 py-1.5 text-xs text-blue-200">{category}: {count}</span>
                      ))}
                      {Object.keys(logAnalysisSummary.category_counts).length === 0 && <span className="text-xs text-slate-500">No matching categories</span>}
                    </div>
                  </div>
                </div>
                {logAnalysisSummary.truncated && <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">The 50-issue analysis limit was reached. {logAnalysisSummary.unprocessed_lines} non-empty line(s) were not scanned; review the input in smaller batches for complete coverage.</p>}
                <p className="mt-4 text-xs leading-5 text-slate-500">Credentials and common token values are redacted before detected log lines are saved. A rule match is diagnostic evidence, not proof of root cause.</p>
              </section>
            )}

            {logAnalysisComplete && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-bold">Analysis Results</h3>
                  <span className="text-sm text-blue-300">
                    {logResults.length} issue(s) detected
                  </span>
                </div>

                {logResults.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6 text-sm text-slate-300">
                    No matching errors or warnings were detected in these logs.
                  </div>
                ) : (
                  logResults.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold">{issue.title}</h4>
                          <p className="mt-1 text-xs text-slate-500">
                            Issue #{issue.id} · {issue.system} · {issue.status}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs ${severityClass[issue.severity]}`}>
                          {issue.severity}
                        </span>
                      </div>
                      <div className="mt-4 space-y-3 text-sm leading-6">
                        {(() => {
                          const diagnostic = logAnalysisSummary?.diagnostics.find((item) => item.issue_id === issue.id);
                          return diagnostic ? (
                            <div className="rounded-xl border border-blue-400/15 bg-blue-400/[0.04] p-3">
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-200">
                                <span>Line {diagnostic.line_number}</span>
                                <span>Level: {diagnostic.level}</span>
                                <span>Category: {diagnostic.category}</span>
                                <span>{diagnostic.confidence} signal</span>
                                {diagnostic.timestamp && <span>{diagnostic.timestamp}</span>}
                              </div>
                              <p className="mt-2 text-xs text-slate-400">Matched rule: {diagnostic.matched_rule} · Pattern: {diagnostic.matched_text}</p>
                              <p className="mt-2 break-words font-mono text-xs text-slate-300">{diagnostic.evidence}</p>
                              {diagnostic.additional_matches.length > 0 && <p className="mt-2 text-xs text-slate-500">Other matching rules: {diagnostic.additional_matches.join(", ")}</p>}
                            </div>
                          ) : null;
                        })()}
                        <p><span className="text-slate-400">Log detail: </span>{issue.description}</p>
                        <p><span className="text-slate-400">Possible cause: </span>{issue.cause}</p>
                        <p><span className="text-slate-400">Recommendation: </span>{issue.recommendation}</p>
                      </div>
                      <p className="mt-4 text-xs text-emerald-300">
                        Saved to Issue Monitor · Awaiting review
                      </p>
                    </div>
                  ))
                )}

                <button
                  onClick={() => changePage("Issue Monitor")}
                  className="rounded-xl border border-white/10 px-5 py-3 text-sm hover:bg-white/5"
                >
                  Open Issue Monitor →
                </button>
              </div>
            )}
          </div>
        ) : activePage === "Root Cause & Correlation" ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-blue-300">DIAGNOSTICS & PATTERN DISCOVERY</p><h3 className="mt-2 text-xl font-bold">Root Cause Analysis & Issue Correlation</h3><p className="mt-1 text-sm text-slate-400">Generate explainable issue assessments and group issues with shared diagnostic signatures.</p></div>
              <button onClick={() => { setLoadingRootCause(true); void loadRootCauseData(); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Refresh analysis</button>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">Analysis engine: deterministic keyword/rule matching. Confidence is a heuristic indicator, not a statistically calibrated probability or proof of root cause.</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Issues reviewed</p><p className="mt-2 text-3xl font-bold">{correlationCount}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Correlation groups</p><p className="mt-2 text-3xl font-bold">{correlationGroups.length}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Saved reports</p><p className="mt-2 text-3xl font-bold">{rootCauseReports.length}</p></div>
            </div>
            <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5">
              <h4 className="text-lg font-semibold">Analyze individual issues</h4><p className="mt-1 text-sm text-slate-400">Run a rule-based assessment for an issue and save its evidence, impact, and recommended actions.</p>
              <div className="mt-4 space-y-3">{issues.map((issue) => <div key={issue.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div className="min-w-0"><p className="text-sm font-semibold">#{issue.id} · {issue.title}</p><p className="mt-1 text-xs text-slate-400">{issue.system} · {issue.severity} · {issue.status}</p></div>{(authUser.role === "Admin" || authUser.role === "Developer") && <button disabled={analyzingIssueId === issue.id} onClick={() => analyzeRootCause(issue.id)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{analyzingIssueId === issue.id ? "Analyzing..." : "Analyze root cause"}</button>}</div>)}</div>
            </section>
            <section className="space-y-3"><h4 className="text-lg font-semibold">Correlated issue groups</h4>{loadingRootCause ? <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">Loading diagnostic patterns...</p> : correlationGroups.length === 0 ? <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No repeated diagnostic signature found yet. Add or analyze more issues to discover shared patterns.</p> : correlationGroups.map((group) => <article key={group.group_id} className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">{group.category} pattern</h5><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs text-blue-300">{group.count} related issues</span><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{group.correlation_score}/100 · {group.confidence}</span></div></div><p className="mt-2 text-sm text-slate-300">{group.summary}</p>{group.shared_signals.length > 0 && <p className="mt-2 text-xs text-slate-400"><strong className="text-slate-300">Shared signals:</strong> {group.shared_signals.join(", ")}</p>}<div className="mt-3 space-y-2">{group.issues.map((item) => <div key={item.id} className="rounded-lg bg-white/[0.03] p-3"><p className="text-sm">#{item.id} · {item.title}</p><p className="mt-1 text-xs text-slate-500">{item.system} · {item.severity} · {item.status} · diagnostic score {item.diagnostic_score.toFixed(2)} ({item.diagnostic_confidence})</p><p className="mt-1 text-xs text-slate-400">{item.evidence.join(" · ")}</p></div>)}</div><p className="mt-3 text-sm text-slate-400"><strong className="text-slate-300">Suggested investigation:</strong> {group.suggested_focus}</p><p className="mt-2 text-xs text-slate-500">Similarity is a heuristic signal, not proof that these issues share one cause.</p></article>)}</section>
            <section className="space-y-3"><h4 className="text-lg font-semibold">Saved root-cause reports</h4>{rootCauseReports.length === 0 ? <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No reports generated yet.</p> : rootCauseReports.map((report) => <article key={report.id} className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-blue-300">REPORT #{report.id} · ISSUE #{report.issue_id}{report.issue_title ? ` · ${report.issue_title}` : ""}</p><h5 className="mt-2 font-semibold">{report.category}: {report.probable_cause}</h5></div><span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-300">{report.confidence} confidence</span></div><p className="mt-3 text-sm text-slate-400"><strong className="text-slate-300">Potential impact:</strong> {report.impact}</p><p className="mt-3 text-sm font-semibold">Evidence</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-400">{report.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul><p className="mt-3 text-sm"><strong>Recommended actions:</strong></p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-400">{report.recommended_actions}</p><p className="mt-3 text-xs text-slate-500">Generated {new Date(report.created_at).toLocaleString()}</p></article>)}</section>
          </div>
        ) : activePage === "Fix Center" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-blue-300">REMEDIATION WORKFLOW</p><h3 className="mt-2 text-xl font-bold">Fix Center</h3><p className="mt-1 text-sm text-slate-400">Review suggested remediation steps, approve or reject them, and prepare approved work for manual application.</p></div>
              <button onClick={() => { setLoadingFixes(true); void loadFixes(); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Refresh recommendations</button>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">Safety notice: recommendations are rule-based guidance, not verified patches. Phase 10 enforces Admin-only independent approval, preparation, and simulation; the recommendation author cannot approve or simulate their own work. Simulation does not execute code or modify connected systems.</div>
            {loadingFixes ? <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6 text-sm text-slate-400">Loading recommendations...</div> : fixes.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-8 text-center"><p className="font-semibold">No fix recommendations yet</p><p className="mt-2 text-sm text-slate-400">Open an issue and select Generate fix recommendation to begin.</p><button onClick={() => changePage("Issue Monitor")} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Go to Issue Monitor</button></div>
            ) : fixes.map((fix) => (
              <article key={fix.id} className="rounded-2xl border border-white/10 bg-[#111a2e] p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-blue-300">FIX #{fix.id} · ISSUE #{fix.issue_id}{fix.issue_title ? ` · ${fix.issue_title}` : ""}</p><h4 className="mt-2 text-lg font-semibold">{fix.title}</h4><p className="mt-2 text-sm leading-6 text-slate-400">{fix.rationale}</p></div><span className={`rounded-full px-3 py-1.5 text-xs ${fix.status === "Approved" ? "bg-emerald-400/10 text-emerald-300" : fix.status === "Rejected" ? "bg-rose-400/10 text-rose-300" : fix.status === "Prepared" ? "bg-blue-400/10 text-blue-300" : "bg-amber-400/10 text-amber-300"}`}>{fix.status}</span></div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-white/10 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Before / current context</p><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-300">{fix.before_text}</pre></div><div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Suggested after / target</p><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-300">{fix.after_text}</pre></div></div>
                <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="text-sm font-semibold">Recommended review steps</p><pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-400">{fix.steps}</pre></div>
                <p className="mt-3 text-xs text-slate-500">Created {new Date(fix.created_at).toLocaleString()} · Proposed by {fix.created_by_email || "Legacy record / not recorded"}</p>
                {fix.approved_by_email && <p className="mt-1 text-xs text-emerald-300">Approved by {fix.approved_by_email}{fix.approved_at ? ` · ${new Date(fix.approved_at).toLocaleString()}` : ""}</p>}
                {fix.rejection_reason && <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">Rejection reason: {fix.rejection_reason}</p>}
                {authUser.role === "Admin" && fix.status === "Proposed" && fix.created_by_email?.toLowerCase() !== authUser.email.toLowerCase() && <div className="mt-4 flex flex-wrap gap-2"><button disabled={updatingFixId === fix.id} onClick={() => updateFix(fix.id, "Approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">Approve recommendation</button><button disabled={updatingFixId === fix.id} onClick={() => updateFix(fix.id, "Rejected")} className="rounded-lg border border-rose-400/30 px-4 py-2 text-sm text-rose-300 hover:bg-rose-400/10 disabled:opacity-50">Reject</button></div>}
                {authUser.role === "Admin" && fix.status === "Approved" && fix.created_by_email?.toLowerCase() !== authUser.email.toLowerCase() && <button disabled={updatingFixId === fix.id} onClick={() => prepareFix(fix.id)} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{updatingFixId === fix.id ? "Preparing..." : "Prepare for manual application"}</button>}
                {authUser.role === "Admin" && fix.status === "Prepared" && fix.created_by_email?.toLowerCase() !== authUser.email.toLowerCase() && <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-blue-300">Approved and prepared. Confirm to record a safe workflow simulation.</p><button disabled={updatingFixId === fix.id} onClick={() => simulateFix(fix.id)} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{updatingFixId === fix.id ? "Running..." : "Run safe simulation"}</button></div>}
                {fix.status === "Simulated" && <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-cyan-300">Simulation completed. No external system was modified.</p>{authUser?.role === "Admin" && <button disabled={updatingFixId === fix.id} onClick={() => rollbackSimulation(fix.id)} className="rounded-lg border border-amber-400/30 px-4 py-2 text-sm text-amber-300 disabled:opacity-50">Mark simulation rolled back</button>}</div>}
                {fix.status === "Rolled Back" && <p className="mt-4 text-sm text-amber-300">Simulation closed as rolled back. No live changes existed.</p>}
                {fix.status === "Rejected" && <p className="mt-4 text-sm text-rose-300">This recommendation was rejected.</p>}
              </article>
            ))}
          </div>
        ) : activePage === "Execution History" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-cyan-300">CONTROLLED AUTOMATION</p><h3 className="mt-2 text-xl font-bold">Execution History</h3><p className="mt-1 text-sm text-slate-400">Audit trail of approved fix workflow simulations. No live systems are modified.</p></div>
              <button onClick={() => { setLoadingExecutions(true); void loadExecutionHistory(); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Refresh history</button>
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-200">Safety boundary: this prototype simulates execution and rollback records only. It does not run shell commands, edit source files, or write to connected services.</div>
            {loadingExecutions ? <p className="text-sm text-slate-400">Loading execution history...</p> : fixExecutions.length === 0 ? <div className="rounded-2xl border border-white/10 p-8 text-center text-slate-400">No execution simulations recorded yet.</div> : <div className="space-y-3">{fixExecutions.map(item => <article key={item.id} className="rounded-xl border border-white/10 bg-[#111a2e] p-4"><div className="flex flex-wrap justify-between gap-2"><div className="font-semibold">Execution #{item.id} · Fix #{item.fix_id} · Issue #{item.issue_id}</div><span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">{item.status}</span></div><p className="mt-2 text-sm text-slate-300">{item.details}</p><p className="mt-2 text-xs text-slate-500">{item.action} · {item.actor_email} · {new Date(item.created_at).toLocaleString()}</p></article>)}</div>}
          </div>
        ) : activePage === "Reports" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-blue-300">ANALYTICS & EXPORT</p><h3 className="mt-2 text-xl font-bold">Enterprise Reports</h3><p className="mt-1 text-sm text-slate-400">Issue summary, severity distribution, status overview, and downloadable CSV report.</p></div>
              <div className="flex gap-2"><button onClick={() => { setLoadingReport(true); void loadReportSummary(); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Refresh</button><button disabled={!reportSummary} onClick={exportReportCsv} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-40">Export CSV</button></div>
            </div>
            {loadingReport ? <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6 text-sm text-slate-400">Generating report...</div> : reportSummary ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Total issues</p><p className="mt-2 text-3xl font-bold">{reportSummary.total_issues}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Open issues</p><p className="mt-2 text-3xl font-bold text-rose-300">{reportSummary.open_issues}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Critical</p><p className="mt-2 text-3xl font-bold text-rose-300">{(reportSummary.severity_breakdown || []).find((x) => x.severity === "Critical")?.count || 0}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">High</p><p className="mt-2 text-3xl font-bold text-amber-300">{(reportSummary.severity_breakdown || []).find((x) => x.severity === "High")?.count || 0}</p></div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h4 className="font-semibold">Severity breakdown</h4>{(reportSummary.severity_breakdown || []).map((item) => <div key={item.severity} className="mt-4"><div className="flex justify-between text-sm"><span>{item.severity}</span><span>{item.count}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-blue-500" style={{ width: `${reportSummary.total_issues ? item.count / reportSummary.total_issues * 100 : 0}%` }} /></div></div>)}</section>
                  <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h4 className="font-semibold">Status breakdown</h4>{(reportSummary.status_breakdown || []).map((item) => <div key={item.status} className="mt-4 flex justify-between border-b border-white/5 pb-3 text-sm"><span>{item.status}</span><strong>{item.count}</strong></div>)}</section>
                </div>
                <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h4 className="font-semibold">Issues by system</h4>{(reportSummary.system_breakdown || []).map((item) => <div key={item.system} className="mt-3 flex justify-between border-b border-white/5 pb-3 text-sm"><span className="text-slate-300">{item.system}</span><strong>{item.count}</strong></div>)}</section>
                {intelligenceTrends && <section className="space-y-4">
                  <div><p className="text-sm font-semibold text-cyan-300">INCIDENT INTELLIGENCE</p><h4 className="mt-1 text-lg font-semibold">Historical trends & recurring incidents</h4></div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <article className="rounded-2xl border border-white/10 bg-[#111a2e] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">Issue creation · last 14 days</h5><span className="text-xs text-slate-400">{intelligenceTrends.trend_events_counted} audit events</span></div>
                      <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
                        {intelligenceTrends.issue_creation_trend.map((day) => {
                          const peak = Math.max(1, ...intelligenceTrends.issue_creation_trend.map((entry) => entry.count));
                          return <div key={day.date} className="flex min-w-0 flex-col items-center gap-2"><div className="flex h-28 w-full items-end rounded-md bg-white/[0.03] p-1"><div title={`${day.count} issues`} className="w-full rounded-sm bg-cyan-500" style={{ height: `${Math.max(day.count ? 8 : 2, day.count / peak * 100)}%` }} /></div><span className="text-[10px] text-slate-500">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit" })}</span><span className="text-xs text-slate-300">{day.count}</span></div>;
                        })}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-500">Source: {intelligenceTrends.trend_source}. {intelligenceTrends.issues_without_creation_audit_event} existing issue(s) lack a creation audit event and are not represented in this historical trend.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h5 className="font-semibold">Recurring incident signatures</h5>{intelligenceTrends.recurring_incidents.length === 0 ? <p className="mt-3 text-sm text-slate-400">No repeated exact issue title and system combinations found.</p> : <div className="mt-3 space-y-3">{intelligenceTrends.recurring_incidents.map((item) => <div key={`${item.system}-${item.title}`} className="rounded-xl bg-white/[0.03] p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><span className="text-xs text-cyan-300">{item.occurrences} occurrences</span></div><p className="mt-1 text-xs text-slate-400">{item.system} · {item.open_occurrences} still open · issue IDs {item.issue_ids.map((id) => `#${id}`).join(", ")}</p><p className="mt-1 text-[11px] text-slate-500">{item.signal}</p></div>)}</div>}</article>
                  </div>
                  <article className="rounded-2xl border border-white/10 bg-[#111a2e] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">Open incident aging</h5><span className="text-xs text-slate-400">{intelligenceTrends.open_issue_aging.issues_with_verified_age} issues with verified age</span></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {Object.entries(intelligenceTrends.open_issue_aging.bucket_counts).map(([bucket, count]) => <div key={bucket} className="rounded-xl bg-white/[0.03] p-3"><p className="text-xs text-slate-400">{bucket}</p><p className="mt-1 text-2xl font-bold">{count}</p></div>)}
                    </div>
                    <h6 className="mt-5 text-sm font-semibold">Oldest open incidents</h6>
                    {intelligenceTrends.open_issue_aging.oldest_open_issues.length === 0 ? <p className="mt-2 text-sm text-slate-400">No open issues have a verifiable creation timestamp.</p> : <div className="mt-3 space-y-2">{intelligenceTrends.open_issue_aging.oldest_open_issues.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] p-3"><div><p className="text-sm font-medium">#{item.id} · {item.title}</p><p className="mt-1 text-xs text-slate-400">{item.system} · {item.severity}</p></div><span className="text-sm font-semibold text-amber-300">{item.age_days} days</span></div>)}</div>}
                    <p className="mt-3 text-xs leading-5 text-slate-500">{intelligenceTrends.open_issue_aging.source}. {intelligenceTrends.open_issue_aging.open_issues_without_creation_audit_event} open issue(s) lack a matching creation event and are excluded. {intelligenceTrends.open_issue_aging.limitations}</p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h5 className="font-semibold">Open issue priority queue</h5>{intelligenceTrends.priority_queue.length === 0 ? <p className="mt-3 text-sm text-slate-400">No open issues require prioritization.</p> : <div className="mt-3 space-y-3">{intelligenceTrends.priority_queue.map((item) => <div key={item.id} className="rounded-xl border border-white/5 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">#{item.id} · {item.title}</p><p className="mt-1 text-xs text-slate-400">{item.system} · {item.severity} · {item.recurrence_count} matching occurrence(s)</p></div><div className="text-right"><p className="text-xl font-bold text-cyan-300">{item.priority_score}<span className="text-xs text-slate-500">/100</span></p><p className="text-[10px] text-slate-500">priority score</p></div></div><p className="mt-2 text-xs leading-5 text-slate-400">{item.reasons.join(" · ")}</p></div>)}</div>}<p className="mt-3 text-xs leading-5 text-slate-500">{intelligenceTrends.priority_method}. Scores are decision-support signals, not predictive outcomes or contractual SLAs.</p></article>
                </section>}
                {incidentForecast && <section className="space-y-4 rounded-2xl border border-cyan-400/20 bg-[#101b30] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">PHASE 8 · PREDICTIVE INCIDENT INTELLIGENCE</p><h4 className="mt-2 text-lg font-semibold">Incident outlook · next 7 days</h4><p className="mt-1 text-xs text-slate-400">Evidence-based trend continuation and early-warning signals.</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">Confidence: {incidentForecast.confidence}</span></div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Previous 7 days</p><p className="mt-1 text-2xl font-bold">{incidentForecast.previous_7_days}</p></div>
                    <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Recent 7 days</p><p className="mt-1 text-2xl font-bold">{incidentForecast.recent_7_days}</p></div>
                    <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Projected next 7 days</p><p className="mt-1 text-2xl font-bold">{incidentForecast.projected_next_7_days === null ? "—" : incidentForecast.projected_next_7_days}</p></div>
                    <div className="rounded-xl bg-white/[0.04] p-3"><p className="text-xs text-slate-400">Open Critical / High</p><p className="mt-1 text-2xl font-bold">{incidentForecast.open_critical} / {incidentForecast.open_high}</p></div>
                  </div>
                  <p className="text-xs leading-5 text-slate-400">{incidentForecast.direction} volume · {incidentForecast.change >= 0 ? "+" : ""}{incidentForecast.change} event(s) versus the previous week. {incidentForecast.confidence_note}</p>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <article className="rounded-xl border border-white/10 p-4"><h5 className="font-semibold">System-level outlook</h5>{incidentForecast.system_outlook.length === 0 ? <p className="mt-2 text-sm text-slate-400">No matched issue-creation events in the comparison window.</p> : <div className="mt-3 space-y-3">{incidentForecast.system_outlook.map((item) => <div key={item.system} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2"><div><p className="text-sm font-medium">{item.system}</p><p className="text-xs text-slate-500">{item.previous_7_days} → {item.recent_7_days} events · {item.direction}</p></div><div className="text-right"><p className="text-lg font-semibold text-cyan-300">{item.projected_next_7_days}</p><p className="text-[10px] text-slate-500">projected</p></div></div>)}</div>}</article>
                    <article className="rounded-xl border border-white/10 p-4"><h5 className="font-semibold">Early-warning signals</h5>{incidentForecast.risk_signals.length === 0 ? <p className="mt-2 text-sm text-slate-400">No recurrence or rising-volume signals found in the available records.</p> : <div className="mt-3 space-y-2">{incidentForecast.risk_signals.map((signal, index) => <div key={`${signal.type}-${signal.system}-${index}`} className="rounded-lg bg-white/[0.03] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{signal.type}</p><span className={`rounded-full px-2 py-0.5 text-[10px] ${signal.severity === "Critical" ? "bg-rose-400/10 text-rose-300" : signal.severity === "High" ? "bg-amber-400/10 text-amber-300" : "bg-slate-400/10 text-slate-300"}`}>{signal.severity}</span></div><p className="mt-1 text-xs text-slate-400">{signal.system} · {signal.detail}</p>{signal.issue_ids.length > 0 && <p className="mt-1 text-[10px] text-slate-500">Evidence: {signal.issue_ids.map((id) => `#${id}`).join(", ")}</p>}</div>)}</div>}</article>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">Based on {incidentForecast.valid_creation_events} valid creation audit events. {incidentForecast.issues_without_creation_event} issue(s) lack a matching creation event. {incidentForecast.methodology} {incidentForecast.limitations}</p>
                </section>}
                <p className="text-xs text-slate-500">Report generated {new Date(reportSummary.generated_at).toLocaleString()}. CSV includes the 20 most recent issues and summary metadata.</p>
              </>
            ) : <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No report data available.</p>}
          </div>
        ) : activePage === "Alert Center" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-rose-300">PRIORITY NOTIFICATIONS</p>
                <h3 className="mt-2 text-xl font-bold">Alert Center</h3>
                <p className="mt-1 text-sm text-slate-400">Persistent, deduplicated alerts from saved issue state and deterministic intelligence signals.</p>
              </div>
              <button onClick={() => { setLoadingAlerts(true); void loadAlerts(); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Evaluate &amp; refresh</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[#111a2e] p-4"><p className="text-sm text-slate-400">Open</p><p className="mt-2 text-2xl font-bold text-rose-300">{alerts.filter((a) => a.status === "Open").length}</p></div>
              <div className="rounded-xl border border-white/10 bg-[#111a2e] p-4"><p className="text-sm text-slate-400">Acknowledged</p><p className="mt-2 text-2xl font-bold text-amber-300">{alerts.filter((a) => a.status === "Acknowledged").length}</p></div>
              <div className="rounded-xl border border-white/10 bg-[#111a2e] p-4"><p className="text-sm text-slate-400">Resolved</p><p className="mt-2 text-2xl font-bold text-emerald-300">{alerts.filter((a) => a.status === "Resolved").length}</p></div>
              <div className="rounded-xl border border-white/10 bg-[#111a2e] p-4"><p className="text-sm text-slate-400">Total recorded</p><p className="mt-2 text-2xl font-bold">{alerts.length}</p></div>
            </div>
            {authUser.role === "Admin" && <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5">
              <div className="mb-3"><h4 className="font-semibold">Alert rule configuration</h4><p className="mt-1 text-xs text-slate-400">Enable or disable deterministic in-app alert conditions. Changes are audit logged.</p></div>
              <div className="space-y-3">{alertRules.map((rule) => <div key={rule.rule_key} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3"><div className="min-w-0"><p className="text-sm font-medium">{rule.name}</p><p className="mt-1 text-xs text-slate-400">{rule.description}</p></div><button disabled={updatingAlertRule === rule.rule_key} onClick={() => void toggleAlertRule(rule)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${rule.is_enabled ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-400/10 text-slate-300"}`}>{updatingAlertRule === rule.rule_key ? "Saving..." : rule.is_enabled ? "Enabled · Disable" : "Disabled · Enable"}</button></div>)}</div>
            </section>}
            {loadingAlerts ? <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">Evaluating alert rules...</p> : alerts.length === 0 ? <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-8 text-center"><p className="font-semibold">No alert history yet</p><p className="mt-2 text-sm text-slate-400">No enabled alert condition has been recorded.</p></div> : <div className="space-y-3">{alerts.map((alert) => <article key={alert.id} className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs ${alert.severity === "Critical" ? "bg-rose-400/10 text-rose-300" : alert.severity === "High" ? "bg-amber-400/10 text-amber-300" : "bg-slate-400/10 text-slate-300"}`}>{alert.severity}</span><span className={`rounded-full px-2 py-1 text-xs ${alert.status === "Open" ? "bg-rose-400/10 text-rose-300" : alert.status === "Acknowledged" ? "bg-amber-400/10 text-amber-300" : "bg-emerald-400/10 text-emerald-300"}`}>{alert.status}</span><span className="text-xs text-slate-500">{alert.source_type}{alert.source_id ? ` #${alert.source_id}` : ""}</span></div><h4 className="mt-3 font-semibold">{alert.title}</h4><p className="mt-1 text-sm text-slate-400">{alert.system} · {alert.description}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Created: {new Date(alert.created_at).toLocaleString()}</span>{alert.acknowledged_by && <span>Acknowledged by: {alert.acknowledged_by}</span>}{alert.resolved_at && <span>Resolved: {new Date(alert.resolved_at).toLocaleString()}</span>}</div>{alert.evidence.length > 0 && <p className="mt-2 text-xs text-slate-500">Evidence: {alert.evidence.map((item, index) => item.issue_id ? `Issue #${item.issue_id}` : item.issue_ids?.length ? `Issues ${item.issue_ids.map((id) => `#${id}`).join(", ")}` : `${item.evidence_count ?? 0} matching observations`).join(" · ")}</p>}</div>
                {(authUser.role === "Admin" || authUser.role === "Developer") && alert.status !== "Resolved" && <div className="flex shrink-0 flex-wrap gap-2">{alert.status === "Open" && <button disabled={updatingAlertId === alert.id} onClick={() => void updateAlertStatus(alert.id, "Acknowledged")} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold disabled:opacity-50">Acknowledge</button>}<button disabled={updatingAlertId === alert.id} onClick={() => void updateAlertStatus(alert.id, "Resolved")} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold disabled:opacity-50">Resolve</button></div>}
              </div></article>)}</div>}
            <p className="text-xs text-slate-500">Evaluation is manual/on page refresh, not a background scheduler. Notifications are persisted in the application database and displayed in-app only; email, SMS, webhooks, and push delivery are not configured.</p>
          </div>
        ) : activePage === "Audit Logs" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-blue-300">SYSTEM ACTIVITY</p>
                <h3 className="mt-2 text-xl font-bold">Audit Logs</h3>
                <p className="mt-1 text-sm text-slate-400">A chronological record of issue and log-analysis activities.</p>
              </div>
              <button
                onClick={() => { setLoadingAuditLogs(true); void loadAuditLogs(); }}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Refresh history
              </button>
            </div>

            {auditLogError && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">{auditLogError}</div>
            )}
            {loadingAuditLogs ? (
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6 text-sm text-slate-400">Loading activity history...</div>
            ) : auditLogs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-8 text-center">
                <p className="font-semibold">No activity recorded yet</p>
                <p className="mt-2 text-sm text-slate-400">Create an issue, update its status, or analyze logs to generate audit entries.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111a2e]">
                <div className="grid grid-cols-1 gap-2 border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid-cols-[1.5fr_3fr_1.5fr]">
                  <span>Activity</span><span>Details</span><span>Date &amp; time</span>
                </div>
                {auditLogs.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-1 gap-2 border-b border-white/5 px-5 py-4 last:border-b-0 sm:grid-cols-[1.5fr_3fr_1.5fr]">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{entry.action}</p>
                      <p className="mt-1 text-xs text-blue-300">{entry.entity_type}{entry.entity_id ? ` #${entry.entity_id}` : ""}</p>
                    </div>
                    <p className="text-sm leading-6 text-slate-400">{entry.details}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">Showing up to 200 most recent records. Entries are stored in the local SQLite database.</p>
          </div>
        ) : activePage === "Integrations" ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
              <p className="text-sm font-semibold text-blue-300">SYSTEM CONNECTIVITY</p>
              <h3 className="mt-2 text-xl font-bold">Integration Registry</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Register external systems and configure HTTPS webhooks for newly generated alerts. Delivery attempts, HTTP outcomes, and failures are recorded below. Repository metadata alone does not imply a live connection.</p>
              {authUser.role === "Admin" && <form onSubmit={saveIntegration} className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Integration type</label>
                  <select value={integrationProvider} onChange={(e) => setIntegrationProvider(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500">
                    <option>GitHub</option><option>GitLab</option><option>Application API</option><option>Business System</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Display name</label>
                  <input required minLength={2} maxLength={100} value={integrationName} onChange={(e) => setIntegrationName(e.target.value)} placeholder="e.g. Main Backend Repository" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-slate-300">Endpoint / repository URL (optional)</label>
                  <input type="url" value={integrationUrl} onChange={(e) => setIntegrationUrl(e.target.value)} placeholder="https://..." className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500" />
                  <p className="mt-2 text-xs text-slate-500">Optional reference URL. Do not enter passwords or access tokens.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-slate-300">Alert webhook URL (optional)</label>
                  <input type="url" value={integrationWebhookUrl} onChange={(e) => setIntegrationWebhookUrl(e.target.value)} placeholder="https://your-service.example.com/nexora/events" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500" />
                  <p className="mt-2 text-xs text-amber-300">HTTPS only; public hosts only; port 443. Webhook requests are signed with NEXORA_SECRET_KEY. Configure a random secret of at least 32 characters on the backend.</p>
                </div>
                <div className="md:col-span-2">
                  <button disabled={savingIntegration} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{savingIntegration ? "Saving..." : "Save Integration"}</button>
                </div>
              </form>}
              {authUser.role !== "Admin" && <p className="mt-5 rounded-lg border border-white/10 p-4 text-sm text-slate-400">Only administrators can add or remove integration registry entries.</p>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Registered Systems ({integrations.length})</h3>
              <button onClick={() => { setLoadingIntegrations(true); void loadIntegrations(); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Refresh</button>
            </div>
            {loadingIntegrations ? <p className="text-sm text-slate-400">Loading integrations...</p> : integrations.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-8 text-center"><p className="font-semibold">No systems registered</p><p className="mt-2 text-sm text-slate-400">Add a repository, application API, or business system above.</p></div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {integrations.map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-[#111a2e] p-5">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-blue-300">{item.provider}</p><h4 className="mt-2 font-semibold">{item.display_name}</h4></div><span className={`rounded-full px-2 py-1 text-xs ${item.webhook_enabled ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-400/10 text-slate-300"}`}>{item.webhook_enabled ? "Webhook enabled" : "Registry only"}</span></div>
                  <p className="mt-4 break-all text-xs text-slate-400">Reference: {item.endpoint_url || "Not provided"}</p>
                  <p className="mt-2 break-all text-xs text-slate-400">Webhook: {item.webhook_url || "Not configured"}</p>
                  <p className="mt-3 text-xs text-slate-500">Added {new Date(item.created_at).toLocaleString()}</p>
                  <p className="mt-2 text-xs text-slate-400">Delivery records: {item.delivery_count ?? 0} · Last success: {item.last_success_at ? new Date(item.last_success_at).toLocaleString() : "None"}</p>
                  {authUser.role === "Admin" && <div className="mt-4 flex flex-wrap gap-2">{item.webhook_enabled && <button disabled={testingIntegrationId === item.id} onClick={() => void testIntegrationWebhook(item.id)} className="rounded-lg border border-blue-400/30 px-3 py-2 text-xs text-blue-300 hover:bg-blue-400/10 disabled:opacity-50">{testingIntegrationId === item.id ? "Testing..." : "Send test event"}</button>}<button onClick={() => removeIntegration(item.id)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs text-rose-300 hover:bg-rose-400/10">Remove configuration</button></div>}
                </div>)}
              </div>
            )}
            <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">DELIVERY OBSERVABILITY</p><h3 className="mt-2 text-lg font-semibold">Webhook Delivery Health</h3></div><button onClick={() => { setLoadingIntegrations(true); void loadIntegrations(); }} className="rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/5">Refresh telemetry</button></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {([ ["Total attempts", integrationObservability?.summary.total ?? 0], ["Delivered", integrationObservability?.summary.delivered ?? 0], ["Failed", integrationObservability?.summary.failed ?? 0], ["Pending", integrationObservability?.summary.pending ?? 0] ] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-[#0b1020] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
              </div>
              <p className="mt-3 text-xs text-slate-500">{integrationObservability?.delivery_semantics || "Delivery metrics are not available yet."}</p>
              <div className="mt-5 space-y-3">{integrationObservability?.recent_deliveries.length ? integrationObservability.recent_deliveries.map((delivery) => <div key={delivery.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{delivery.display_name} · {delivery.event_type}</p><p className="mt-1 text-xs text-slate-500">{new Date(delivery.created_at).toLocaleString()} · Attempts: {delivery.attempt_count}{delivery.response_code ? ` · HTTP ${delivery.response_code}` : ""}</p></div><span className={`rounded-full px-2 py-1 text-xs ${delivery.status === "Delivered" ? "bg-emerald-400/10 text-emerald-300" : delivery.status === "Failed" ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-300"}`}>{delivery.status}</span></div>{delivery.error_message && <p className="mt-2 break-words text-xs text-rose-300">{delivery.error_message}</p>}</div>) : <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">No webhook delivery attempts recorded yet.</p>}</div>
            </section>
          </div>
        ) : activePage === "User Management" && authUser.role !== "Admin" ? (
          <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-300">Administrator permissions are required to manage user accounts.</div>
        ) : activePage === "User Management" ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Total accounts</p><p className="mt-2 text-3xl font-bold">{managedUsers.length}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Active accounts</p><p className="mt-2 text-3xl font-bold text-emerald-300">{managedUsers.filter((item) => item.is_active).length}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-sm text-slate-400">Administrators</p><p className="mt-2 text-3xl font-bold text-cyan-300">{managedUsers.filter((item) => item.role === "Admin" && item.is_active).length}</p></div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">ACCESS CONTROL</p><h3 className="mt-2 text-xl font-bold">Create user account</h3><p className="mt-1 text-sm text-slate-400">Provision an account and assign its initial workspace role.</p></div>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">Administrator only</span>
              </div>
              <form onSubmit={createManagedUser} className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-300">Full name<input required minLength={2} maxLength={100} value={managedUserForm.full_name} onChange={(event) => setManagedUserForm((current) => ({ ...current, full_name: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500" placeholder="Full name" /></label>
                <label className="text-sm text-slate-300">Email address<input required type="email" maxLength={254} value={managedUserForm.email} onChange={(event) => setManagedUserForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500" placeholder="user@company.com" /></label>
                <label className="text-sm text-slate-300">Temporary password<input required type="password" minLength={10} maxLength={128} value={managedUserForm.password} onChange={(event) => setManagedUserForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500" placeholder="At least 10 characters" /><span className="mt-1 block text-xs text-slate-500">Share the temporary password securely. Password reset is not yet available.</span></label>
                <label className="text-sm text-slate-300">Initial role<select value={managedUserForm.role} onChange={(event) => setManagedUserForm((current) => ({ ...current, role: event.target.value as UserRole }))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none focus:border-blue-500"><option value="Viewer">Viewer</option><option value="Developer">Developer</option><option value="Admin">Admin</option></select></label>
                <div className="md:col-span-2"><button disabled={creatingManagedUser} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{creatingManagedUser ? "Creating account..." : "Create account"}</button></div>
              </form>
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111a2e]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><h3 className="font-semibold">User directory</h3><p className="mt-1 text-xs text-slate-400">Manage account roles and access status.</p></div><button onClick={() => { setLoadingUsers(true); void loadManagedUsers(); }} disabled={loadingUsers} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50">{loadingUsers ? "Refreshing..." : "Refresh users"}</button></div>
              {usersError && <div role="alert" className="m-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">{usersError}</div>}
              {loadingUsers && managedUsers.length === 0 ? <p className="p-6 text-sm text-slate-400">Loading user directory...</p> : managedUsers.length === 0 ? <p className="p-6 text-sm text-slate-400">No user accounts found.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Actions</th></tr></thead><tbody>{managedUsers.map((managedUser) => <tr key={managedUser.id} className="border-t border-white/5"><td className="px-5 py-4"><p className="font-medium text-slate-100">{managedUser.full_name}</p><p className="mt-1 text-xs text-slate-400">{managedUser.email}{managedUser.id === authUser.id ? " · You" : ""}</p></td><td className="px-5 py-4"><select aria-label={`Role for ${managedUser.email}`} value={managedUser.role} disabled={updatingManagedUserId === managedUser.id || managedUser.id === authUser.id} onChange={(event) => void updateManagedUserRole(managedUser, event.target.value as UserRole)} className="rounded-lg border border-white/10 bg-[#0b1020] px-3 py-2 text-xs disabled:opacity-50"><option value="Admin">Admin</option><option value="Developer">Developer</option><option value="Viewer">Viewer</option></select></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${managedUser.is_active ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-400/10 text-slate-400"}`}>{managedUser.is_active ? "Active" : "Inactive"}</span></td><td className="px-5 py-4 text-xs text-slate-400">{new Date(managedUser.created_at).toLocaleDateString()}</td><td className="px-5 py-4">{managedUser.id === authUser.id ? <span className="text-xs text-slate-500">Current account</span> : <button disabled={updatingManagedUserId === managedUser.id} onClick={() => void updateManagedUserStatus(managedUser)} className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${managedUser.is_active ? "border-rose-400/20 text-rose-300 hover:bg-rose-400/10" : "border-emerald-400/20 text-emerald-300 hover:bg-emerald-400/10"}`}>{updatingManagedUserId === managedUser.id ? "Saving..." : managedUser.is_active ? "Deactivate" : "Activate"}</button>}</td></tr>)}</tbody></table></div>
              )}
              <p className="border-t border-white/5 px-5 py-4 text-xs leading-5 text-slate-500">Deactivating an account revokes its existing sessions. The last active administrator cannot be demoted or deactivated. Password reset and account deletion are not included in this release.</p>
            </section>
          </div>
        ) : activePage === "System Health" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">OPERATIONS</p><h3 className="mt-2 text-2xl font-bold">System Health</h3><p className="mt-1 text-sm text-slate-400">Backend and local database status for this Nexora prototype.</p></div>
              <div className="flex gap-2">
                <button onClick={() => { setLoadingSystemOverview(true); void loadSystemOverview(); }} disabled={loadingSystemOverview} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">{loadingSystemOverview ? "Refreshing..." : "Refresh status"}</button>
                <button onClick={downloadDatabaseBackup} disabled={downloadingBackup || authUser?.role !== "Admin"} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{downloadingBackup ? "Preparing..." : "Download DB backup"}</button>
              </div>
            </div>
            {systemOverviewError && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">{systemOverviewError}</div>}
            {loadingSystemOverview && !systemOverview ? <div className="rounded-xl border border-white/10 bg-[#111a2e] p-6 text-sm text-slate-400">Loading system status...</div> : systemOverview ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Application</p><p className="mt-3 text-xl font-bold">{systemOverview.application}</p><p className="mt-1 text-sm text-slate-400">Version {systemOverview.version}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Database</p><p className={`mt-3 text-xl font-bold ${systemOverview.database.connected ? "text-emerald-300" : "text-rose-300"}`}>{systemOverview.database.connected ? "Connected" : "Unavailable"}</p><p className="mt-1 text-sm text-slate-400">{systemOverview.database.file_name} · {Math.round(systemOverview.database.size_bytes / 1024)} KB</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Environment</p><p className="mt-3 text-xl font-bold capitalize">{systemOverview.environment}</p><p className="mt-1 text-sm text-slate-400">Checked {new Date(systemOverview.checked_at).toLocaleString()}</p></div>
                </div>
                {systemOverview.reliability && (
                  <section className="rounded-2xl border border-white/10 bg-[#111a2e] p-5" aria-label="Reliability posture">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Reliability insights</p><h4 className="mt-2 text-lg font-semibold">Operational posture score</h4><p className="mt-1 text-xs text-slate-400">Deterministic assessment of local database integrity and recorded open incidents.</p></div>
                      <div className="text-right"><p className={`text-4xl font-bold tabular-nums ${systemOverview.reliability.score >= 85 ? "text-emerald-300" : systemOverview.reliability.score >= 65 ? "text-amber-300" : "text-rose-300"}`}>{systemOverview.reliability.score}<span className="text-base text-slate-500">/100</span></p><p className="mt-1 text-xs text-slate-300">{systemOverview.reliability.rating}</p></div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {Object.entries(systemOverview.reliability.dimensions).map(([key, dimension]) => <div key={key} className="rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium capitalize text-slate-200">{key.replaceAll("_", " ")}</p><span className="text-sm font-semibold tabular-nums">{dimension.score}/100</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${dimension.score}%` }} /></div><p className="mt-2 text-xs text-slate-500">Weight {dimension.weight_percent}% · {dimension.detail}</p></div>)}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-slate-500">Open incidents</p><p className="mt-1 text-xl font-semibold">{systemOverview.reliability.open_incidents.total}</p></div>
                      <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-slate-500">Critical / High</p><p className="mt-1 text-xl font-semibold">{systemOverview.reliability.open_incidents.by_severity.Critical + systemOverview.reliability.open_incidents.by_severity.High}</p></div>
                      <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-slate-500">Open over 7 days</p><p className="mt-1 text-xl font-semibold">{systemOverview.reliability.open_incidents.older_than_7_days}</p></div>
                      <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-slate-500">Age unknown</p><p className="mt-1 text-xl font-semibold">{systemOverview.reliability.open_incidents.unknown_age}</p></div>
                    </div>
                    <div className="mt-5"><h5 className="text-sm font-semibold">Reliability findings</h5><div className="mt-2 space-y-2">{systemOverview.reliability.findings.map((finding, index) => <div key={`${finding.title}-${index}`} className="rounded-lg border border-white/10 p-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${finding.severity === "Critical" ? "bg-rose-400/10 text-rose-300" : finding.severity === "High" ? "bg-amber-400/10 text-amber-300" : "bg-slate-400/10 text-slate-300"}`}>{finding.severity}</span><p className="text-sm font-medium text-slate-200">{finding.title}</p></div><p className="mt-1 text-xs leading-5 text-slate-400">{finding.detail}</p></div>)}</div></div>
                    <p className="mt-4 text-xs leading-5 text-amber-300">{systemOverview.reliability.methodology.note}</p>
                    <p className="mt-2 text-[11px] text-slate-500">Calculated {new Date(systemOverview.reliability.checked_at).toLocaleString()} · Score is not an uptime, latency, availability, or SLA measurement.</p>
                  </section>
                )}
                <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h4 className="font-semibold">Database record counts</h4><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(systemOverview.records).map(([name, count]) => <div key={name} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-3"><span className="text-sm capitalize text-slate-400">{name.replaceAll("_", " ")}</span><span className="font-semibold tabular-nums">{String(count)}</span></div>)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"><h4 className="font-semibold">Capability status</h4><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(systemOverview.capabilities).map(([name, value]) => <div key={name} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2"><span className="text-sm capitalize text-slate-400">{name.replaceAll("_", " ")}</span><span className="text-right text-xs font-medium text-cyan-300">{String(value).replaceAll("_", " ")}</span></div>)}</div><p className="mt-4 text-xs leading-5 text-amber-300">Transparency note: log analysis and root-cause suggestions use predefined rules. Integrations are registry entries only; no external systems are being monitored or modified.</p></div>
              </>
            ) : <div className="rounded-xl border border-white/10 bg-[#111a2e] p-6 text-sm text-slate-400">No health information available yet.</div>}
            <p className="text-xs text-slate-500">Database backup is available to Admin users only. Store downloaded backups securely; they may contain account and issue data.</p>
          </div>
        ) : activePage === "Settings" ? (
          <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
            <h3 className="font-semibold">Safety and permissions</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Future settings will control agent permissions, approval rules,
              and connected systems. Activity history is available in Audit Logs. This prototype does not make
              changes to external systems.
            </p>
          </div>
        ) : selectedIssue ? (
          /* Issue details */
          <div className="space-y-5">
            <button
              onClick={() => {
                setSelectedIssueId(null);
                setNotice(null);
              }}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              ← Back to issues
            </button>

            <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500">
                    Issue #{selectedIssue.id} · {selectedIssue.system}
                  </p>
                  <h3 className="mt-3 text-2xl font-bold">
                    {selectedIssue.title}
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs ${severityClass[selectedIssue.severity]}`}
                  >
                    {selectedIssue.severity}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs ${statusClass[selectedIssue.status]}`}
                  >
                    {selectedIssue.status}
                  </span>
                </div>
              </div>

              <div className="mt-8 grid gap-5 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 p-5">
                  <h4 className="font-semibold">Issue description</h4>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {selectedIssue.description}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 p-5">
                  <h4 className="font-semibold">Possible cause</h4>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {selectedIssue.cause}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-blue-400/20 bg-blue-400/5 p-5">
                <div className="flex items-center gap-2">
                  <span className="text-xl text-blue-300">✦</span>
                  <h4 className="font-semibold">Recommended next steps</h4>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {selectedIssue.recommendation}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Sample recommendation, not an AI-generated diagnosis.
                  Verify the cause before making changes.
                </p>
              </div>

              {(authUser.role === "Admin" || authUser.role === "Developer") && <div className="mt-6 flex flex-wrap gap-3">
                <button disabled={generatingFixFor === selectedIssue.id} onClick={() => generateFix(selectedIssue.id)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{generatingFixFor === selectedIssue.id ? "Generating..." : "Generate fix recommendation"}</button>
                <button onClick={() => changePage("Fix Center")} className="rounded-xl border border-white/10 px-5 py-3 text-sm hover:bg-white/5">Open Fix Center</button>
              </div>}

              {(authUser.role === "Admin" || authUser.role === "Developer") && selectedIssue.status === "Open" && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    disabled={updatingIssueId !== null}
                    onClick={() =>
                      updateIssue(selectedIssue.id, "Approved")
                    }
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingIssueId === selectedIssue.id
                      ? "Updating..."
                      : "Approve recommendation"}
                  </button>

                  <button
                    disabled={updatingIssueId !== null}
                    onClick={() =>
                      updateIssue(selectedIssue.id, "Dismissed")
                    }
                    className="rounded-xl border border-white/10 px-5 py-3 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Dismiss issue
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Dashboard statistics */}
            {activePage === "Dashboard" && (
              <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Open Issues",
                    value: openIssues,
                    note: "Awaiting review",
                    color: "text-blue-400",
                  },
                  {
                    label: "Critical Issues",
                    value: criticalIssues,
                    note: "Require attention",
                    color: "text-rose-400",
                  },
                  {
                    label: "Fixes Approved",
                    value: approvedIssues,
                    note: "Approval recorded",
                    color: "text-emerald-400",
                  },
                  {
                    label: "Connected Systems",
                    value: 0,
                    note: "No integrations configured",
                    color: "text-violet-400",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-[#111a2e] p-5"
                  >
                    <p className="text-sm text-slate-400">{stat.label}</p>
                    <p className={`mt-4 text-3xl font-bold ${stat.color}`}>
                      {stat.value}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{stat.note}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Dashboard panels */}
            {activePage === "Dashboard" && (
              <div className="mb-8 grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
                  <h3 className="font-semibold">System Health</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Current prototype status
                  </p>

                  <div className="mt-6 space-y-5">
                    {[
                      {
                        name: "Website interface",
                        status: "Running",
                        progress: 100,
                      },
                      {
                        name: "Python backend",
                        status: loadingIssues
                          ? "Connecting"
                          : apiError
                            ? "Unavailable"
                            : "Connected",
                        progress: loadingIssues ? 50 : apiError ? 0 : 100,
                      },
                      {
                        name: "AI analysis engine",
                        status: "Not configured",
                        progress: 0,
                      },
                      {
                        name: "External integrations",
                        status: "Not connected",
                        progress: 0,
                      },
                    ].map((item) => (
                      <div key={item.name}>
                        <div className="mb-2 flex justify-between gap-3 text-sm">
                          <span>{item.name}</span>
                          <span className="text-slate-400">{item.status}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#111a2e] p-6">
                  <h3 className="font-semibold">Issue management</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Explore the current dataset
                  </p>
                  <div className="mt-5 space-y-4 text-sm text-slate-300">
                    <p>• Search by issue title or system.</p>
                    <p>• Filter issues by severity and status.</p>
                    <p>• Review possible causes and recommendations.</p>
                    <p>• Record approvals and dismissals through the API.</p>
                  </div>
                  <button
                    onClick={() => changePage("Issue Monitor")}
                    className="mt-6 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500"
                  >
                    Explore issues →
                  </button>
                </div>
              </div>
            )}

            {/* Approval center notice */}
            {activePage === "Approval Center" && (
              <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
                Review open issues before approving or dismissing them.
                Approval records a decision; it does not execute a fix.
              </div>
            )}

            {historyIssueId !== null && (
              <section className="mb-5 rounded-2xl border border-cyan-400/20 bg-[#111a2e] p-5" aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-cyan-300">AUDIT-BACKED HISTORY</p>
                    <h3 className="mt-1 text-lg font-semibold">Issue #{historyIssueId} · {issueHistory?.issue_title || "Lifecycle timeline"}</h3>
                    <p className="mt-1 text-xs text-slate-400">Chronological events retained in the audit log</p>
                  </div>
                  <button onClick={() => { setHistoryIssueId(null); setIssueHistory(null); setIssueHistoryError(""); }} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Close history</button>
                </div>
                {loadingIssueHistory ? <p className="mt-4 text-sm text-slate-400">Loading issue history...</p> : issueHistoryError ? <p role="alert" className="mt-4 text-sm text-rose-300">{issueHistoryError}</p> : issueHistory && (
                  <>
                    {issueHistory.events.length === 0 ? <p className="mt-4 rounded-lg bg-white/[0.03] p-4 text-sm text-slate-400">No audit events explicitly linked to this issue were found.</p> : <ol className="mt-5 space-y-3">
                      {issueHistory.events.map((event) => <li key={event.id} className="relative border-l border-cyan-400/30 pl-5 pb-2">
                        <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-cyan-400" />
                        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-200">{event.action}</p><time className="text-xs text-slate-500">{Number.isNaN(Date.parse(event.created_at)) ? event.created_at : new Date(event.created_at).toLocaleString()}</time></div>
                        <p className="mt-1 text-sm leading-5 text-slate-400">{event.details}</p>
                      </li>)}
                    </ol>}
                    {issueHistory.truncated && <p className="mt-3 text-xs text-amber-300">Only the latest 200 linked events are shown.</p>}
                    <p className="mt-4 text-xs leading-5 text-slate-500">{issueHistory.coverage_note}</p>
                  </>
                )}
              </section>
            )}

            {/* Issue table */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111a2e]">
              <div className="border-b border-white/10 p-5 md:p-6">
                <h3 className="font-semibold">
                  {activePage === "Approval Center"
                    ? "Pending Approvals"
                    : "Issue Monitor"}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Search, filter, and inspect issues from the backend.
                </p>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div>
                    <label
                      htmlFor="issue-search"
                      className="mb-2 block text-xs text-slate-400"
                    >
                      Search issues
                    </label>
                    <input
                      id="issue-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Title, system, description..."
                      className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="severity-filter"
                      className="mb-2 block text-xs text-slate-400"
                    >
                      Severity
                    </label>
                    <select
                      id="severity-filter"
                      value={severityFilter}
                      onChange={(event) =>
                        setSeverityFilter(event.target.value)
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="All">All severities</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="status-filter"
                      className="mb-2 block text-xs text-slate-400"
                    >
                      Status
                    </label>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value)
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="All">All statuses</option>
                      <option value="Open">Open</option>
                      <option value="Approved">Approved</option>
                      <option value="Dismissed">Dismissed</option>
                    </select>
                  </div>
                </div>
                {(authUser.role === "Admin" || authUser.role === "Developer") && <div className="mt-5 flex justify-end">
  <button
    onClick={() => {
      setNewIssue(emptyForm);
      setShowAddForm(true);
      setNotice(null);
    }}
    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
  >
    + Add New Issue
  </button>
</div>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">
                    Showing {filteredIssues.length} of{" "}
                    {activePage === "Approval Center"
                      ? issues.filter((issue) => issue.status === "Open").length
                      : issues.length}{" "}
                    issues
                  </p>
                  <button
                    onClick={resetFilters}
                    className="text-xs text-blue-300 hover:text-blue-200"
                  >
                    Clear search and filters
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-white/[0.02] text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">Issue</th>
                      <th className="px-6 py-4 font-medium">Severity</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => (
                      <tr
                        key={issue.id}
                        className="border-t border-white/5 transition hover:bg-white/[0.02]"
                      >
                        <td className="px-6 py-5">
                          <p className="font-medium">{issue.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {issue.system}
                          </p>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`rounded-full px-3 py-1 text-xs ${severityClass[issue.severity]}`}
                          >
                            {issue.severity}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={`rounded-full px-3 py-1 text-xs ${statusClass[issue.status]}`}
                          >
                            {issue.status}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                setSelectedIssueId(issue.id);
                                setNotice(null);
                              }}
                              className="font-medium text-blue-300 hover:text-blue-200"
                            >
                              Details
                            </button>
                            <button
                              onClick={() => historyIssueId === issue.id ? (setHistoryIssueId(null), setIssueHistory(null), setIssueHistoryError("")) : void loadIssueHistory(issue.id)}
                              className="font-medium text-cyan-300 hover:text-cyan-200"
                            >
                              {historyIssueId === issue.id ? "Hide history" : "History"}
                            </button>

                            {(authUser.role === "Admin" || authUser.role === "Developer") && issue.status === "Open" && (
                              <button
                                disabled={updatingIssueId !== null}
                                onClick={() =>
                                  updateIssue(issue.id, "Approved")
                                }
                                className="font-medium text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                              >
                                {updatingIssueId === issue.id
                                  ? "Updating..."
                                  : "Approve"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredIssues.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center">
                          <p className="font-medium">No issues found</p>
                          <p className="mt-2 text-sm text-slate-400">
                            Try another search term or change your filters.
                          </p>
                          <button
                            onClick={resetFilters}
                            className="mt-4 text-sm text-blue-300 hover:text-blue-200"
                          >
                            Clear filters
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <footer className="py-8 text-center text-xs text-slate-500">
          Nexora AI · Enterprise Debugging Prototype · v1.0
        </footer>
      </section>
    </main>
  );
}