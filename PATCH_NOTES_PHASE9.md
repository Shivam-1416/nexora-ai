# NEXORA AI — Phase 9: Advanced Alerting & Notification Workflows

## Included files
- `backend/main.py`
- `app/page.tsx`

## What changed

### Backend
- Added idempotent, additive SQLite tables: `alert_rules` and `alert_events`.
- Existing `issues`, `audit_logs`, `alert_reads`, users, sessions, and other records are retained. No database file is included in this patch.
- Added default configurable alert rules:
  - Critical and High open issues
  - Recurring open issue signatures
  - Rising incident volume
- Added `GET /api/alert-rules` and Admin-only `PATCH /api/alert-rules/{rule_key}`.
- Added Admin/Developer-only `POST /api/alerts/evaluate` to evaluate current issue state and Phase 8 deterministic forecast signals.
- Reworked `GET /api/alerts` to return persisted alert history, evidence, timestamps, and lifecycle status.
- Added Admin/Developer-only `PATCH /api/alerts/{alert_id}/status` for `Acknowledged` and `Resolved` transitions.
- Kept the previous `PATCH /api/alerts/{issue_id}/read` route as a compatibility endpoint.
- Alert fingerprints prevent duplicate records on repeated evaluation. Alerts are auto-resolved when their triggering condition clears. A manually resolved alert remains resolved while its condition is still active; if the condition clears and later returns, the alert can reopen.
- Alert rule changes, evaluations, acknowledgements, and resolutions are written to audit logs.

### Frontend
- Replaced the previous issue-only Alert Center with a persistent notification history.
- Added Open, Acknowledged, Resolved, and total counts.
- Added Admin-only rule enable/disable controls.
- Added acknowledgement and resolution actions for Admin/Developer users; Viewer remains read-only.
- Shows alert source, severity, system, evidence, creation time, acknowledgement actor, and resolution time.

## Operational boundaries
- Evaluation is invoked when an authorized user opens or refreshes Alert Center; there is no background scheduler in this phase.
- Notifications are persisted and displayed in-app only. Email, SMS, webhooks, and push delivery are not configured.
- Alert conditions are deterministic and use saved NEXORA issue records plus the existing Phase 8 forecast signals. This phase does not claim external-system monitoring or machine-learning predictions.

## Validation performed for this patch
- `python -m py_compile backend/main.py` passed.
- Isolated FastAPI TestClient checks passed for rule seeding, alert generation, deduplication, manual resolution persistence, automatic resolution after condition clearance, reopening after a condition returns, and Viewer read-only authorization.
- TypeScript TSX transpilation passed with zero diagnostics.
- Full ESLint, TypeScript project type-check, and Next.js production build were not run in this Linux workspace because the installed `node_modules` type packages are incomplete. Run the full checks on the Windows project after applying the patch.

## Database safety
- Do not replace, delete, or reset `backend/nexora.db`.
- The application creates the two Phase 9 tables on startup using `CREATE TABLE IF NOT EXISTS`; the only compatibility adjustment is an additive column check for the new alert-events table.
- No database file is included in this ZIP.
