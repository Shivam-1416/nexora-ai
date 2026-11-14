# NEXORA AI — Phase 2 User Management Patch

## Included changes

- Added an Admin-only User Management workspace to the existing Next.js dashboard.
- Added user directory loading, account creation, role updates, and activation/deactivation controls.
- Added FastAPI `PATCH /api/auth/users/{user_id}/status` with session revocation on deactivation.
- Hardened role updates to prevent self-demotion and protect the last active administrator.
- Kept the existing `users` and `auth_sessions` schema; no migration is required.
- Applied role-aware navigation and hid mutation controls from Viewer accounts.
- Preserved the Phase 1 health endpoint, backend Dockerfile, root Docker Compose file, and deployment documentation.
- Replaced the generated `LayoutProps` reference with React's `ReactNode` type for portable TypeScript checking.

## Files

- `app/page.tsx`
- `app/layout.tsx`
- `backend/main.py`
- `backend/Dockerfile`
- `docker-compose.yml`
- `README.md`

## Validation performed

- ESLint: passed using the project's installed ESLint package.
- TypeScript: `tsc --noEmit` passed.
- Python syntax: `py_compile` passed.
- Isolated FastAPI tests: admin bootstrap, user listing, managed account creation, role updates, self-demotion protection, self-deactivation protection, session revocation, inactive-login rejection, and Viewer authorization restrictions passed.
- Tests used temporary SQLite databases and did not access or modify the user's `backend/nexora.db`.
- A production build could not be run in this Linux validation container because the archive's installed Next.js dependencies do not contain the Linux SWC binary. Run `npm run build` on the Windows development machine after applying the patch.

## Apply

Extract this ZIP into the project root `D:\enterprise-debugger` and allow the listed files to overwrite their matching source files. Do not delete or replace `backend\nexora.db`.
