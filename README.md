# Nexora AI: Unified Enterprise Debugging and Automation  System

NEXORA AI is an enterprise issue-intelligence dashboard with a Next.js frontend and a FastAPI backend. Current workflows include issue monitoring, authenticated log analysis, audit history, integration management and outbound alert webhooks, rule-based root-cause analysis, fix recommendations, simulation history, reports, alerts, and system health metadata.

## Requirements

- Node.js 20 or later
- Python 3.10 or later

## Local development

### 1. Start the FastAPI backend

From the project root:

```bash
python -m pip install -r backend/requirements.txt
uvicorn main:app --reload --app-dir backend --host 127.0.0.1 --port 8000
```

The backend uses `backend/nexora.db` by default. Keep this file if it contains existing records. Do not delete it to troubleshoot the application. To test database changes, use a separate copy and set `NEXORA_DB_PATH` to that copy.

### 2. Configure and start the Next.js frontend

Copy `.env.example` to `.env.local` and adjust `NEXT_PUBLIC_API_URL` only if the backend is hosted somewhere other than `http://127.0.0.1:8000`.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### 3. First account

On a fresh local database, the first account registered becomes the initial administrator. After that account exists, self-registration is closed; an administrator must provision additional users.

## Configuration

Backend environment variables:

- `NEXORA_DB_PATH`: optional SQLite database path; defaults to `backend/nexora.db`.
- `NEXORA_ENV`: `development` or `production`.
- `NEXORA_SECRET_KEY`: production secret; use a unique random value of at least 32 characters.
- `NEXORA_SESSION_HOURS`: session lifetime, bounded by the backend.
- `NEXORA_CORS_ORIGINS`: comma-separated frontend origins.

Frontend environment variable:

- `NEXT_PUBLIC_API_URL`: base URL for the FastAPI API. For the public Docker profile it is set at image-build time to the HTTPS application origin.

## Capability boundaries

Log analysis and root-cause analysis use deterministic rules and evidence; they are not LLM-generated diagnoses. Configured integrations can receive outbound HTTPS webhook events when new NEXORA alert events are created; this is not full provider OAuth, inbound webhook ingestion, or generic API synchronization. Fix execution remains a controlled workflow simulation and does not modify repositories or production systems. Reliability insights are based on local application data, not external infrastructure telemetry or an uptime/SLA measurement.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
python -m py_compile backend/main.py
```

## Docker deployment

The backend Dockerfile builds the FastAPI service. The public deployment profile is defined in the root `docker-compose.yml` and uses:

- Next.js frontend container.
- FastAPI backend container.
- Caddy reverse proxy with automatic HTTPS.
- Persistent Docker volumes for SQLite data and Caddy certificate/configuration state.

For a public VPS deployment, follow [DEPLOYMENT_PUBLIC.md](./DEPLOYMENT_PUBLIC.md). Importantly, create the initial administrator with `docker compose exec backend python bootstrap_admin.py` before starting the public Caddy service. The backend and frontend do not publish host ports; only Caddy exposes ports 80 and 443.

Never run `docker compose down -v` on a server containing application data. That command removes named volumes. Back up the production database and verify restoration before upgrades.
