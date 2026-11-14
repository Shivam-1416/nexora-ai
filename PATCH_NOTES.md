# NEXORA AI v1.6 maintenance patch

## Changes

- Log Analyzer now sends the existing `nexora_token` Bearer session and uses `NEXT_PUBLIC_API_URL`.
- The main dashboard and standalone Log Analyzer share the same configurable backend URL convention.
- Sensitive business-data GET endpoints now require an authenticated session; fix-execution history remains Admin/Developer restricted.
- Corrected managed-user email validation so ordinary valid email addresses are accepted.
- Updated API root version to 1.6.0 and removed the stale readiness note about missing frontend token wiring.
- Replaced default Next.js metadata and starter README with NEXORA AI project information.
- Added SQLite database patterns to `.gitignore` to reduce accidental commits. This does not delete or alter any database.

## Files in this patch

- `app/page.tsx`
- `app/log-analyzer/page.tsx`
- `app/layout.tsx`
- `backend/main.py`
- `.env.example`
- `.gitignore`
- `README.md`

## Apply

Extract this patch into the existing project root and allow it to replace only the files listed above. Do not replace `backend/nexora.db`. Install dependencies only if needed, then start the backend and frontend using the README instructions.

## Verification performed

- Python syntax compilation passed.
- TSX syntax transpilation passed for the three updated frontend files.
- Backend smoke tests passed against a fresh temporary SQLite database: nine sensitive GET routes returned 401 without authentication; valid managed-user email creation succeeded; authenticated log analysis saved an issue.
- Full Next.js typecheck/build was not run because project dependencies were not installed in the isolated validation workspace.
