# NEXORA AI — Phase 6: Issue Lifecycle History

## Scope
Adds an authenticated, issue-specific audit timeline using existing `audit_logs` records. No database schema changes are made.

## Files
- `backend/main.py`
- `app/page.tsx`

## Backend
- Adds `GET /api/issues/{issue_id}/history`.
- Requires an authenticated session, consistent with issue read access.
- Returns chronological audit events where `entity_type = 'Issue'` and `entity_id` matches the requested issue.
- Returns 404 for unknown issue IDs.
- Returns at most 200 most-recent linked events and indicates truncation.
- Includes an explicit coverage note: only retained events explicitly linked to the issue are shown; other entity types and unrecorded activity are not represented.
- Does not alter audit records or database schema.

## Frontend
- Adds a History action to each Issue Monitor / Approval Center row.
- Displays an expandable lifecycle timeline with event action, details, and timestamp.
- Includes loading, error, empty, truncation, and coverage states.
- Available to authenticated roles; the endpoint uses the same authenticated read boundary as the issue list.

## Validation performed in the build environment
- `python -m py_compile backend/main.py` — passed.
- Isolated FastAPI TestClient checks — passed: unauthenticated request rejected, issue creation and status-change events returned chronologically, unknown issue returns 404.
- TypeScript TSX transpilation — passed with zero syntax diagnostics.
- `npm run lint` could not run because this environment does not contain `node_modules` (`eslint: not found`). Full TypeScript check and Next.js production build must be run in the user's Windows project environment.

## Database safety
- No migration.
- No database file included.
- Existing `backend/nexora.db` is not accessed or modified by this patch.
