# NEXORA AI — Phase 8: Predictive Incident Intelligence

## Included files
- `backend/main.py`
- `app/page.tsx`

## Features
- Adds authenticated `GET /api/intelligence/forecast`.
- Compares verified `Issue created` audit events across the preceding two seven-day windows.
- Produces a transparent next-seven-day incident-volume estimate using deterministic linear trend continuation: recent seven-day count plus the change versus the preceding seven days.
- Provides per-system directional outlooks, with recurrence and rising-volume early-warning signals.
- Adds a Predictive Incident Intelligence panel to Enterprise Reports with observed counts, projection, evidence confidence, risk signals, and methodology limitations.
- When fewer than five valid creation events exist in the 14-day comparison window, the endpoint returns `projected_next_7_days: null` and `confidence: Insufficient evidence` instead of fabricating a forecast.

## Important interpretation limits
- This is a deterministic heuristic, not machine learning, a calibrated failure probability, or an SLA forecast.
- Only valid `Issue created` audit events matched to existing issue IDs are counted for time-series calculations.
- Existing issues without creation audit events are disclosed and excluded from the historical forecast.
- Seasonality, workload changes, telemetry, deployment events, and external system signals are not modeled.

## Database safety
- No schema changes or migrations.
- No database file is included in this patch.
- Forecast endpoint uses read-only queries.

## Apply
Extract the ZIP into the project root and overwrite the matching files. Then run:

```powershell
npm run lint
npx tsc --noEmit
npm run build
.\backend\venv\Scripts\python.exe -m py_compile .\backend\main.py
```
