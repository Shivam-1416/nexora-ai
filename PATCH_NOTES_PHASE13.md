# NEXORA AI — Phase 13: Public Deployment & CI/CD Foundation

## Included files

- `Dockerfile.frontend`
- `backend/Dockerfile`
- `backend/bootstrap_admin.py`
- `docker-compose.yml`
- `Caddyfile`
- `.dockerignore`
- `.env.example`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `DEPLOYMENT_PUBLIC.md`
- `README.md`

## Implementation

### Public deployment topology
- Adds a production Next.js container and retains the FastAPI container.
- Adds Caddy as the only service publishing host ports 80/443.
- Routes `/api/*` and `/health` to FastAPI; all other paths route to Next.js.
- Uses Caddy automatic HTTPS and persistent certificate/configuration volumes.
- Uses a persistent named SQLite volume at `/app/data/nexora.db`.
- Backend and frontend ports are internal only; no public SQLite or direct API port.

### Initial administrator bootstrap
- Adds an interactive `bootstrap_admin.py` command inside the backend container.
- Uses the existing application registration and password-hashing code.
- Refuses to create a user if the database already contains any account.
- Allows the deployment sequence to create the initial Admin before starting the public reverse proxy, closing the first-user registration race window during launch.
- Does not print the one-time registration/session token.

### CI/CD
- GitHub Actions CI runs frontend lint, TypeScript, production build, Python dependency installation, and syntax checks.
- A manually triggered production deployment workflow uses SSH secrets and a verified known-hosts entry to pull `main`, build, and restart Compose services.
- The workflow does not transfer `.env`, secrets, or database files.

### Container and secret hygiene
- Frontend uses Node 22 and installs production-only dependencies in its runtime stage.
- Backend runs as a non-root user.
- `.dockerignore` excludes local databases, virtual environments, `.env`, Git metadata, and build caches.
- Production secret and domain are required by Compose; backend Phase 12 validation continues to fail closed on weak secrets or invalid CORS configuration.

## Validation performed for this patch
- Python syntax compilation for `backend/bootstrap_admin.py` passed.
- Docker Compose YAML parsed successfully.
- Workflow YAML parsed successfully.
- Deployment file references and Docker build contexts were inspected.
- Existing Phase 12 backend and frontend source files are not modified by this patch.
- No database file is included or changed.

## Deployment prerequisites / limitations
- A VPS, domain DNS, Docker Engine/Compose, and GitHub deployment secrets are required to make the application publicly reachable. They are not provisioned by this patch.
- The first Admin must be created with the bootstrap command before starting Caddy.
- The included profile is single-backend/single-VPS. The current process-local rate limiter and SQLite storage are not suitable for horizontal multi-replica scaling.
- External uptime monitoring, durable webhook queues, PostgreSQL migration, and an SLA are not claimed by this phase.
