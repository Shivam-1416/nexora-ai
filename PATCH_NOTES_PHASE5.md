# NEXORA AI — Phase 5: Incident Aging & Staleness Visibility

## Files in this patch
- `backend/main.py`
- `app/page.tsx`

## Added

### Extended authenticated API: `GET /api/intelligence/trends`
- Adds `open_issue_aging` to the existing intelligence response.
- Buckets open issues with a valid `Issue created` audit event into Under 24 hours, 1–3 days, 3–7 days, and Over 7 days.
- Returns up to ten oldest open incidents with age in hours/days, severity, system, and verified creation timestamp.
- Separately reports open issues without a matching creation audit event; these are not assigned a fabricated age.
- Retains existing Admin/Developer/Viewer authenticated read access. Unauthenticated requests remain rejected.

### Reports UI
- Adds an Open Incident Aging panel with bucket counts and oldest open incidents.
- Shows the number of open issues excluded because creation time cannot be verified.

## Method and limitations
- Age is elapsed time since the matching `Issue created` audit event, not time since the last update or time-to-resolution.
- Issues lacking a valid creation audit event are excluded from age buckets and the oldest-incident list.
- Buckets are operational visibility groupings only. They are not configured SLAs, contractual targets, or breach predictions.
- Future-dated creation events are clamped to age zero rather than displaying negative age.
- No database schema changes or migrations.
- No database file is included, read, reset, or replaced by this patch.

## Validation performed in the patch environment
- Python compilation: passed.
- Isolated FastAPI TestClient: passed for all four age buckets, oldest-first ordering, missing-timestamp coverage, unauthenticated rejection, and authenticated Viewer read access.
- Frontend TSX transpilation: passed.
- Full ESLint, TypeScript project check, and Next.js production build must be run in the user's Windows project environment.

## Apply
Extract the ZIP into the project root and overwrite the two matching source files. Do not copy any database file.

```powershell
cd D:\enterprise-debugger
npm run lint
npx tsc --noEmit
npm run build
.\backend\venv\Scripts\python.exe -m py_compile .\backend\main.py
```
