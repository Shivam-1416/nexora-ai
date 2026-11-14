# NEXORA AI — Phase 3 Intelligence Engine Patch

## Files
- `backend/main.py` — structured log parsing, sensitive-value redaction, diagnostic aggregation, evidence-linked root-cause classification.
- `app/page.tsx` — log-analysis summary panel and per-finding evidence display.
- `README.md` — Phase 3 capability boundaries and behavior.

## What changed
1. Extracts recognizable timestamps and log levels from each matched line.
2. Selects the highest-severity matching rule per source line while retaining additional matching rule names.
3. Reports total, non-empty, matched, unmatched, and unprocessed line counts, plus severity/category distributions.
4. Caps issue creation at 50 findings per request and explicitly reports if additional non-empty lines were not scanned.
5. Redacts common `password`, `api_key`, `secret`, `access_token`, bearer-token, and URL query-token values before persisting matched source lines.
6. Adds source-line evidence and matched diagnostic terms to root-cause reports.
7. Keeps the existing deterministic/rule-based capability boundary explicit in the UI and API.

## Compatibility and data safety
- No database schema changes or migrations.
- Existing issue and root-cause report tables are reused.
- Existing API routes and issue response fields remain available; the log-analysis response adds summary and diagnostic fields.
- No changes to authentication or Phase 2 RBAC behavior.
- Do not replace, delete, or reset `backend/nexora.db`.

## Validation performed in the build workspace
- ESLint: passed.
- TypeScript (`tsc --noEmit`): passed.
- Python syntax compilation: passed.
- Isolated FastAPI tests: passed for timestamp/level extraction, severity/category counts, evidence attribution, secret redaction, root-cause report history, 50-result cap, and Viewer authorization denial.
- Production build could not be executed in this Linux workspace because the installed Next.js dependencies do not include the Linux SWC binary. Run `npm run build` in the Windows project environment.

## Apply
Extract the patch ZIP into the project root `D:\enterprise-debugger` and overwrite the matching files. The ZIP intentionally does not contain a database file.

Then run in PowerShell:

```powershell
cd D:\enterprise-debugger
npm run lint
npx tsc --noEmit
npm run build
.\backend\venv\Scripts\python.exe -m py_compile .\backend\main.py
```
