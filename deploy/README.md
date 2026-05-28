# Production Deploy

Single-VPS deploy using Docker Compose. Caddy (in a container) serves the
SPA at `/` and reverse-proxies the API at `/api`. Postgres + Redis run
alongside as compose services. The worker runs as a separate process. R2
(Cloudflare) is the only external dependency.

**Current arrangement (temporary):** this stack is co-hosted with another
project (cirth) on a shared VPS, so **host nginx terminates TLS** and
forwards to Caddy on `127.0.0.1:8080`. Caddy itself listens on plain
HTTP `:80` inside the container and no longer obtains Let's Encrypt
certs (host certbot does that for nginx). When ERP gets its own VPS,
revert to Caddy-terminates-TLS by:

- restoring the `80:80`/`443:443`/`443:443/udp` port mappings on the
  `caddy` service in `docker-compose.prod.yml` (and removing the
  `127.0.0.1:8080:80` mapping);
- restoring the global `email {$ACME_EMAIL}` and the `{$DOMAIN} {` site
  block in `deploy/Caddyfile` (and removing the
  `servers { trusted_proxies … }` global block and the `:80` site label);
- removing the host nginx vhost.

---

## Topology

```
                     ┌──────────────────────────────────────────┐
                     │                  VPS                     │
 Internet ──443──▶   │ ┌────────────┐                            │
                     │ │ host nginx │ TLS termination            │
                     │ │ (certbot)  │ ── erp.* ─▶ 127.0.0.1:8080 │
                     │ └─────┬──────┘                            │
                     │       │                                   │
                     │       ▼   ┌──────── Docker ────────┐      │
                     │ ┌────────┐│                        │      │
                     │ │ caddy  ││ ── /         → SPA     │      │
                     │ │ :80    ││ ── /api/auth → api     │      │
                     │ │        ││ ── /api/*    → api     │      │
                     │ └────┬───┘│                        │      │
                     │      │    │ ┌────▼────┐ ┌────────┐ │      │
                     │      └────┼▶│   api   │▶│postgres│ │      │
                     │           │ │ Elysia  │ └────────┘ │      │
                     │           │ └────┬────┘ ┌────────┐ │      │
                     │           │      └─────▶│ redis  │ │      │
                     │           │              └───┬────┘ │      │
                     │           │ ┌──────────┐    │      │      │
                     │           │ │  worker  │────┘      │      │
                     │           │ │ BullMQ   │           │      │
                     │           │ └──────────┘           │      │
                     │           │ ┌──────────┐ (one-shot)│      │
                     │           │ │ migrate  │           │      │
                     │           │ └──────────┘           │      │
                     │           └────────────────────────┘      │
                     └──────────────────────────────────────────┘

       ───https───▶ Cloudflare R2  (presigned-URL uploads, external)
```

Only **host nginx** publishes host ports (80, 443). The Caddy container
binds `127.0.0.1:8080` (loopback only). Postgres, Redis, API, and the
worker are reachable only on the internal compose network.

---

## File layout

```
docker-compose.prod.yml      Production stack (5 services + 1 one-shot)
.env.production.example      Committed template for the env file
.env.production              Real secrets (VPS-only, chmod 600, gitignored)
.dockerignore                Keeps secrets and node_modules out of build context

deploy/
  Caddyfile                  Reverse-proxy + TLS + SPA routing
  Dockerfile.api             API image (runs `bun src/index.ts`)
  Dockerfile.worker          Worker image
  Dockerfile.web             SPA build → caddy:2-alpine final stage
  Dockerfile.migrate         One-shot Drizzle migration runner
  entrypoint-migrate.sh      Runs control + tenant migrations in order
  README.md                  This file
```

`docker-compose.yml` at the repo root is for **local dev only** (Postgres +
Redis exposed on host ports). Never use it in production.

---

## Caddy routing

`deploy/Caddyfile` resolves three classes of paths under a single domain:

| Incoming path                | Action                          | Reaches                  |
|------------------------------|---------------------------------|--------------------------|
| `/api/auth/me`               | strip `/api`                    | `/auth/me` on api        |
| `/api/auth/switch-tenant`    | strip `/api`                    | `/auth/switch-tenant`    |
| `/api/auth/*` (everything else) | pass through unchanged       | Better Auth handler      |
| `/api/*`                     | strip `/api`                    | root routes on api       |
| `/api/tenant/realtime`       | strip `/api`, preserve upgrade  | WebSocket on api         |
| `/`, SPA routes              | serve `/srv/index.html`         | (baked into caddy image) |

### Why the special-case auth matcher

The API mounts most routes at the root (`/health`, `/tenant/*`,
`/realtime/*`). Better Auth's handler lives at `/api/auth/*` — and the
project also exposes two **custom** auth routes at `/auth/me` and
`/auth/switch-tenant`. So Caddy must:

1. Recognize `/api/auth/me` and `/api/auth/switch-tenant` and strip `/api`
   (they're custom routes, not Better Auth's).
2. Pass `/api/auth/*` through unchanged for everything else (Better Auth
   needs to see the full path).
3. Strip `/api` from every other API route.

Order matters in the Caddyfile — the specific `@custom_auth` matcher
must precede the general `handle /api/auth/*`.

WebSocket upgrade is preserved automatically by Caddy v2's `reverse_proxy`
across `handle_path` rewrites; no extra directive is required.

---

## Services

### `caddy` (built from `Dockerfile.web`)

- Multi-stage build: stage 1 runs `bun run build` on the SPA, stage 2 is
  `caddy:2-alpine` with the SPA dist baked into `/srv` and the Caddyfile
  at `/etc/caddy/Caddyfile`.
- Vite envs (`VITE_API_URL`, `VITE_VAPID_PUBLIC_KEY`) are **build args**.
  Rebuilding the image is required when either changes.
- **Currently serves plain HTTP on `:80`** (bound to `127.0.0.1:8080`
  on the host); host nginx is the TLS terminator. The `caddy_data` /
  `caddy_config` volumes are still declared but unused while TLS lives
  outside the container — handy for the eventual revert.

### `api` (built from `Dockerfile.api`)

- Runs the Elysia app directly from source: `bun src/index.ts`.
  Bundling with `bun build --target bun` was tried first but inlines
  `import.meta.dir`, which breaks Drizzle migration paths in
  `packages/db/src/migrations/fanout.ts`.
- Healthcheck hits `http://127.0.0.1:3001/health`; container is reported
  healthy once it responds 200.

### `worker` (built from `Dockerfile.worker`)

- BullMQ consumer. Same source-execution pattern as the api.
- No exposed port. Connects to Redis on the compose network.

### `migrate` (built from `Dockerfile.migrate`)

- One-shot. `restart: "no"`. Depends on `postgres` being healthy.
- Runs `bun src/migrations/control.ts` (control schema), then
  `bun src/migrations/fanout.ts` (every tenant schema), then exits 0.
- `api` and `worker` depend on this completing successfully via
  `service_completed_successfully` — they won't start until migrations
  finished.

### `postgres` (`postgres:16-alpine`)

- Data in the `postgres_data` named volume.
- **Pinned to major 16.** Bumping major versions requires a dump/restore.

### `redis` (`redis:7-alpine`)

- AOF persistence enabled (`--appendonly yes`).
- Holds BullMQ queue state + rate-limit counters.

---

## Environment variables

Everything app-side reads `.env.production` via `env_file:`. Compose
itself reads it via `--env-file .env.production` for `${VAR}`
interpolation in the compose file (DOMAIN, ACME_EMAIL, postgres user
etc.).

### Required values

| Variable                  | Used by                | Notes                                            |
|---------------------------|------------------------|--------------------------------------------------|
| `DOMAIN`                  | compose, Caddy         | bare domain, no scheme. e.g. `erp.example.com`.  |
| `ACME_EMAIL`              | Caddy                  | Let's Encrypt expiry alerts. **Unused in the current nginx-fronted arrangement** but kept in the env file for the eventual revert. |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` | postgres + DATABASE_URL | Keep password identical in both places. |
| `DATABASE_URL`            | api, worker, migrate   | Host MUST be `postgres` (service name), port 5432. |
| `REDIS_URL`               | api, worker            | Host MUST be `redis`.                            |
| `PORT`                    | api                    | `3001`.                                          |
| `NODE_ENV`                | api                    | `production` (enables secure cookies).           |
| `CORS_ORIGINS`            | api                    | `https://${DOMAIN}`. Same-origin, so this is mostly a guard. |
| `BETTER_AUTH_SECRET`      | api                    | ≥ 32 chars. `openssl rand -base64 48`.           |
| `BETTER_AUTH_URL`         | api                    | **Origin only**, no `/api` suffix. See trap #1. |
| `BOOTSTRAP_TOKEN`         | api, scripts           | Header required by `POST /tenants`.              |
| `R2_*`                    | api                    | Cloudflare R2 endpoint, keys, bucket, public URL. |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `_SUBJECT` | api, worker | Server-side Web Push.       |
| `VITE_VAPID_PUBLIC_KEY`   | web (build arg)        | Same value as `VAPID_PUBLIC_KEY`; baked into SPA. |
| `ERROR_REPORTER_URL`      | api                    | Optional. Sentry/Logtail/Slack webhook.          |

`VITE_API_URL` is **not** in the env file — it's hard-coded to
`https://${DOMAIN}/api` as a compose build arg on the `caddy` service.
The same-origin mount never changes per environment.

---

## First deploy

```sh
# On the VPS, as a user with docker permissions
git clone https://github.com/AbdukahharS/erp-renovation.git /opt/erp
cd /opt/erp
cp .env.production.example .env.production
chmod 600 .env.production
$EDITOR .env.production    # fill in all required values

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

First build takes ~5–10 minutes (downloads base images, runs
`bun install`, builds the SPA). The `migrate` service runs and exits
before `api`/`worker` start.

### Host nginx + TLS (current arrangement)

The Caddy container binds `127.0.0.1:8080` only, so it isn't reachable
from the internet yet. Add an nginx vhost on the host that terminates
TLS and forwards to it:

```nginx
# /etc/nginx/sites-available/erp
server {
    listen 80;
    listen [::]:80;
    server_name erp.example.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket upgrade for /api/tenant/realtime
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

Enable + reload + obtain a cert:

```sh
ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/erp
nginx -t && systemctl reload nginx
certbot --nginx -d erp.example.com   # choose "redirect" when prompted
```

Certbot rewrites the vhost in place (adds the `listen 443 ssl` block +
HTTP→HTTPS redirect) and registers its renewal timer.

### Bootstrap the first tenant + super-admin

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec api \
  bun /app/scripts/provision-tenant.ts \
  --name="Your Company" \
  --slug="yourco" \
  --owner-email="you@example.com" \
  --owner-name="Your Name" \
  --owner-password="<≥ 12 chars>"

docker compose --env-file .env.production -f docker-compose.prod.yml exec api \
  bun /app/scripts/promote-super-admin.ts --email="you@example.com"
```

Then open `https://${DOMAIN}/` and log in.

---

## Update flow

```sh
cd /opt/erp
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker image prune -f
```

`migrate` re-runs automatically (Drizzle's journal makes it idempotent).
Only the services whose images changed are recreated.

### Updating a single service

```sh
# Just the SPA / proxy:
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build caddy

# Just the API (rebuild + restart):
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api
```

### Zero-ish-downtime SPA update

A `up -d --build caddy` takes the SPA down for the duration of the
rebuild + container swap (a few minutes). To minimize this:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml build caddy
docker compose --env-file .env.production -f docker-compose.prod.yml up -d caddy
```

The build runs against the old container still serving traffic; only
the final swap causes a few seconds of downtime.

### Env-only change

If you only edit `.env.production` (e.g. updating an R2 key):

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d api worker
```

No rebuild. Web args (`VITE_*`) require a rebuild of `caddy`.

---

## Operations

### Logs

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=80 api
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=80 worker
```

### Shell into a container

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec api sh
```

`api` and `worker` are Alpine-based — `sh`, `wget`, `bun` available.
`curl` is **not** installed; use `wget` for ad-hoc HTTP tests.

### Restart something

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

### Postgres backup

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres pg_dumpall -U "$POSTGRES_USER" \
  | gzip > /var/backups/erp/pg-$(date +%F).sql.gz
```

Schedule via host cron. Rotate after 14 days. Consider off-site copy
via rclone to R2.

### Postgres restore

```sh
gunzip -c /var/backups/erp/pg-YYYY-MM-DD.sql.gz \
  | docker compose --env-file .env.production -f docker-compose.prod.yml \
      exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

### Clear Redis (rate-limit reset etc.)

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec redis redis-cli FLUSHALL
```

Safe on a fresh deploy. **Destructive** later — drops queued BullMQ
jobs and active rate-limit counters.

### Nuke and rebuild (only on fresh deploy / dev VPS!)

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml down
docker volume rm erp-prod_postgres_data erp-prod_redis_data
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

**Wipes all data.** Never run on a real tenant.

---

## Verification checklist

```sh
curl -fsS  https://${DOMAIN}/api/health    # {"ok":true}
curl -fsS  https://${DOMAIN}/api/ready     # db + redis ok
curl -fsSI https://${DOMAIN}/              # 200, text/html, HSTS header
```

- Cert: `curl -vI https://${DOMAIN} 2>&1 | grep -i 'issuer\|subject'`
  → issuer is Let's Encrypt (issued to host nginx by certbot, not Caddy).
- `nginx -t` is clean and `systemctl status nginx` is active.
- Worker log: BullMQ connected to `redis:6379`.
- DevTools Network on SPA: API calls to `https://${DOMAIN}/api/...`,
  no CORS preflight failures.
- Login → `Set-Cookie` has `Domain=${DOMAIN}`, `Secure`, `HttpOnly`,
  `SameSite=Lax`.
- WebSocket: DevTools shows `wss://${DOMAIN}/api/tenant/realtime` with
  `101 Switching Protocols`.

---

## Traps (real ones we hit during the first deploy)

### 1. `BETTER_AUTH_URL` must NOT end in `/api`

Better Auth derives its basePath from the URL's pathname. Setting
`BETTER_AUTH_URL=https://erp.example.com/api` makes basePath `/api`,
which then strips `/api` from `/api/auth/sign-in/email` to `/auth/...`,
which doesn't match Better Auth's internal routes → every auth
endpoint 404s. Use origin only: `BETTER_AUTH_URL=https://erp.example.com`.

### 2. Better Auth client `baseURL` is **origin**, not API base

In `apps/web/src/lib/auth.ts`, the Better Auth client gets
`apiBaseUrl.replace(/\/api\/?$/, "")`. The client appends `/api/auth/...`
itself. If you give it `https://${DOMAIN}/api`, it constructs
`/sign-in/email` (missing `/auth`) → 404.

### 3. Don't `bun build --target bun` the api

The bundler inlines `import.meta.dir`, which breaks
`packages/db/src/migrations/fanout.ts` (it resolves `drizzle/tenant`
relative to its own source location). Run the api from source:
`bun src/index.ts`. Bun runs TS natively at full speed.

### 4. Vite reads `.env` files, not `process.env`

`apps/web/vite.config.ts` sets `envDir` to the repo root. The web
Dockerfile materializes `/app/.env` from build args because Vite
**only loads `.env` files** for `VITE_*` vars (it doesn't read the
shell environment). Just exporting env vars before `bun run build`
wouldn't work.

### 5. Alpine images have no `curl`

Use `wget` for ad-hoc tests inside containers. Healthchecks use
`wget -qO-`.

### 6. DNS inside containers

If Caddy fails to obtain a cert with
`dial tcp: lookup ... on 127.0.0.53:53`, Docker can't resolve DNS
through the host's `systemd-resolved`. Fix at the daemon level:

```sh
echo '{"dns": ["1.1.1.1", "8.8.8.8"]}' > /etc/docker/daemon.json
systemctl restart docker
```

### 7. Rate-limit on `/tenants`

The bootstrap endpoint is rate-limited to 5/hour per IP (Phase 9
hardening). On a fresh deploy you'll usually have headroom; if you
burn it experimenting, clear it with
`redis-cli DEL` against the `rl:bootstrap:*` keys, or `FLUSHALL` on
a fresh deploy.

### 8. Port 80/443 already in use

`bind: address already in use` means another reverse proxy (often
`nginx`) is on the host. Either stop it (`systemctl stop nginx`) or
integrate ERP into the existing reverse proxy and remove Caddy from
the compose file. **This is exactly what the current nginx-fronted
arrangement does** — Caddy doesn't bind 80/443 at all, so this trap is
moot until the eventual revert.

### 9. `routeTree.gen.ts` not generated in clean builds

The web `build` script runs `tsc -b && vite build`, but
`routeTree.gen.ts` is only emitted by the Vite plugin during
`vite build` — which is too late for `tsc`. The Dockerfile runs
`bun run generate:routes && bun run build` to fix this. Don't
collapse those two steps.
