# NEXORA AI — Phase 4: Historical Trends & Incident Prioritization

## Files in this patch
- `backend/main.py`
- `app/page.tsx`

## Added

### Read-only API: `GET /api/intelligence/trends`
- Requires an authenticated session; available to Admin, Developer, and Viewer roles.
- Returns a 14-day UTC issue-creation trend derived from `audit_logs` entries whose entity type is `Issue` and action is exactly `Issue created`.
- Returns a data-coverage count for existing issue records that do not have a matching creation audit event.
- Detects recurring incident signatures conservatively using exact normalized issue-title + system matches. Includes occurrence counts, open counts, issue IDs, and the matching signal.
- Returns the ten highest-priority open issues using a transparent deterministic score based on severity, open status, repeated exact signatures, and audit-event recency.
- Includes scoring rationale and an explicit method/limitations description.

### Reports UI
- Adds a 14-day issue-creation bar chart, recurring incident list, and open-issue priority queue to Enterprise Reports.
- Displays historical coverage limitations and clarifies that scores are decision-support heuristics, not predictive outcomes or SLAs.

## Data safety and limitations
- No database schema changes or migrations.
- Does not write to the database; reads existing issue and audit records only.
- Does not include or replace `backend/nexora.db`.
- Issue records without an `Issue created` audit event cannot be reliably dated with the current schema and are excluded from historical daily counts. The API reports this count rather than inventing dates.
- Recurrence uses exact normalized title + system matches to avoid overstating semantic similarity.
- Priority scores are deterministic heuristics, not an AI prediction, causal conclusion, or SLA calculation.

## Validation performed in the patch environment
- Python compilation: passed.
- Isolated FastAPI TestClient: passed for audit-derived daily counts, 14-day trend shape, recurrence grouping, priority ordering, and authenticated Viewer read access.
- Frontend lint/typecheck/production build: not completed in this environment because dependency installation did not complete. Run the four local checks below on the Windows project environment.

## Apply
Extract the ZIP into the project root and overwrite the two matching files. Do not copy any database file.

```powershell
cd D:\enterprise-debugger
npm run lint
npx tsc --noEmit
npm run build
.\backend\venv\Scripts\python.exe -m py_compile .\backend\main.py
```
