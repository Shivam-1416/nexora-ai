# NEXORA AI — Public VPS Deployment

This deployment profile runs the Next.js frontend, FastAPI backend, and Caddy reverse proxy with automatic HTTPS. Only Caddy publishes public ports. The API and frontend remain on the private Docker network; SQLite and Caddy state use persistent Docker volumes.

## Requirements

- A Linux VPS with Docker Engine and the Docker Compose plugin.
- A domain or subdomain whose DNS `A` record points to the VPS public IPv4 address.
- Inbound TCP ports 80 and 443 available for Caddy/ACME; SSH available for administration.
- A unique production secret generated on a trusted machine.
- Recommended starting point: 2 vCPU and 4 GB RAM for a small evaluation deployment. Size from observed workload before production commitments.

Do not publish the SQLite database port or the backend's port 8000 to the internet.

## 1. Prepare the server

Clone the repository to a stable path, for example `/opt/nexora`, and enter it:

```bash
git clone YOUR_REPOSITORY_URL /opt/nexora
cd /opt/nexora
cp .env.example .env
```

Edit `.env`:

```dotenv
NEXORA_DOMAIN=nexora.yourdomain.com
NEXORA_SECRET_KEY=PASTE_A_UNIQUE_RANDOM_SECRET
NEXORA_SESSION_HOURS=12
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Generate a secret on a trusted machine:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Put the generated value in the server's `.env`. Keep `.env` private and outside source control. Do not use the example placeholder.

Set the DNS `A` record for `NEXORA_DOMAIN` to the VPS IPv4 address. If you publish an `AAAA` record, ensure IPv6 routing and firewall rules are also correct.

## 2. Build the images

```bash
docker compose config --quiet
docker compose build
```

The frontend's public API origin is embedded at build time as `https://NEXORA_DOMAIN`. If the domain changes, rebuild the frontend image after updating `.env`.

## 3. Create the first administrator before public exposure

This is an important security step. The first successful registration becomes the initial Admin. Do not expose the registration endpoint to the public internet before creating that account.

Start only the internal application services. Neither service publishes a host port:

```bash
docker compose up -d backend frontend
docker compose ps
```

Create the first administrator interactively inside the backend container:

```bash
docker compose exec backend python bootstrap_admin.py
```

The script prompts for email, full name, and password without echoing the password. It refuses to create an account if any user already exists. It uses the application's existing password hashing and registration logic and does not print the generated session token.

After the script confirms creation, sign in through the application once the proxy is started. Additional users should be provisioned by the Admin through User Management.

If the database already contains users, do not run a reset or delete the database. Sign in with an existing Admin account instead.

## 4. Publish the HTTPS application

Start Caddy only after the first administrator exists:

```bash
docker compose up -d caddy
```

Caddy obtains and renews TLS certificates automatically when the domain resolves to this server and ports 80/443 are reachable.

Check service health:

```bash
docker compose ps
docker compose logs --tail=100 caddy backend frontend
```

Check the public endpoints:

```bash
curl -fsS https://YOUR_DOMAIN/health
curl -fsS https://YOUR_DOMAIN/api/deployment/readiness
```

The readiness response should report `status: ready`. Open `https://YOUR_DOMAIN` and sign in.

## 5. Routine update / redeploy

After pushing reviewed changes to the repository's `main` branch:

```bash
cd /opt/nexora
git pull --ff-only origin main
docker compose build
docker compose up -d
docker compose ps
```

The named `nexora_data` volume is retained when containers are rebuilt or recreated. Never run `docker compose down -v` on a server containing data; `-v` deletes named volumes.

## 6. Backups and recovery

- Back up the SQLite database regularly and copy backups off the VPS to encrypted storage.
- Use the Admin database-backup endpoint for a consistent SQLite snapshot, or use SQLite's backup API while the service is running.
- Test restoration into a separate staging volume before relying on a backup.
- Back up the `.env` secret securely. Losing `NEXORA_SECRET_KEY` invalidates the ability to verify existing signed/session tokens as designed.
- Preserve `caddy_data` so certificate state survives container recreation.

Never include the production database or `.env` in Git, Docker build context, or a public artifact.

## 7. GitHub Actions CI/CD

The included `.github/workflows/ci.yml` runs on pushes and pull requests to `main`:
- `npm ci`, ESLint, TypeScript, and Next.js production build.
- Python dependency installation and backend syntax compilation.

The included `.github/workflows/deploy-production.yml` is manually triggered from the GitHub Actions tab. Configure:

**GitHub repository secrets**
- `DEPLOY_HOST`: VPS hostname or IP.
- `DEPLOY_USER`: SSH deployment user.
- `DEPLOY_SSH_KEY`: private key authorized on the VPS.
- `DEPLOY_KNOWN_HOSTS`: verified `known_hosts` line for that VPS. Obtain and verify the host key independently; do not blindly trust an unverified `ssh-keyscan` result.

**GitHub repository variable**
- `DEPLOY_PATH`: absolute checkout path on the VPS, such as `/opt/nexora`.

The VPS must already have the repository cloned at `DEPLOY_PATH`, a valid private `.env`, Docker Compose installed, and the first Admin created. The workflow pulls `main`, builds images, and runs `docker compose up -d`. It does not transfer `.env` or database files.

## Production limitations to understand

- This deployment intentionally runs one backend instance. The current API rate limiter is process-local; do not scale backend replicas without a shared rate limiter at the gateway.
- SQLite on a single VPS is appropriate for an initial single-node deployment, not shared multi-node writes. Evaluate PostgreSQL before horizontal scaling or higher write concurrency.
- Webhook delivery remains synchronous and bounded as documented in Phase 11; this does not provide a durable message queue or guaranteed delivery.
- Caddy provides TLS termination and reverse proxying, not an application uptime SLA.
- Configure VPS firewalling, OS updates, SSH hardening, encrypted off-host backups, outbound egress restrictions, and external uptime monitoring.
- The first Admin must be created before starting the public Caddy service. Do not skip this step.
