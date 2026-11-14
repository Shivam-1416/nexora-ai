# NEXORA AI — Phase 7: Operational Health Scoring & Reliability Insights

## Files in this patch
- `backend/main.py`
- `app/page.tsx`

## Changes
- Added authenticated `GET /api/system/reliability` (Admin and Developer roles).
- Runs SQLite `PRAGMA quick_check` and returns a database-integrity dimension.
- Scores open incident severity with explicit, bounded penalties: Critical 25, High 10, Medium 4, Other 2 points per issue, capped at a 100-point dimension penalty.
- Scores open incidents older than seven days with a 10-point penalty per verified aged issue, capped at 100.
- Uses only explicit `Issue created` audit events to establish age. Issues without a valid creation event are counted as unknown and excluded from the aging penalty.
- Overall score weights: database integrity 40%, incident severity 40%, incident aging 20%.
- Returns findings, dimension scores, issue coverage counts, and methodology.
- Added the Reliability Insights panel to System Health, including score, dimensions, open issue counts, findings, and limitations.

## Important interpretation
This is a deterministic local operational-risk indicator. It is not uptime, latency, availability, SLA compliance, or live infrastructure monitoring. Integrations remain registry-only. No external systems are contacted.

## Database safety
- No schema migration.
- No database file is included in this patch.
- The endpoint performs read-only queries; it does not modify issue, audit, user, or session records.

## Validation performed in the build environment
- `python -m py_compile backend/main.py` — passed.
- Isolated FastAPI TestClient checks — passed for SQLite quick_check, severity scoring, audit-backed aging, unknown-age coverage, and Viewer authorization denial.
- TypeScript/JSX `transpileModule` syntax check for `app/page.tsx` — passed.
- Full ESLint, `tsc --noEmit`, and Next.js production build were not run in this environment because project dependencies/node_modules were not installed. Run the full Windows validation commands after applying.

## Apply
Extract the ZIP into the project root and overwrite the two matching files. Then run:

```powershell
npm run lint
npx tsc --noEmit
npm run build
.\backend\venv\Scripts\python.exe -m py_compile .\backend\main.py
```
