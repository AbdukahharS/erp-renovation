# Deploy (Phase 9)

## Topology

Two Railway services + two managed addons:

| Service | Source | Start command | Healthcheck |
|---------|--------|---------------|-------------|
| `api` | repo root | `bun run --filter api start` | `/ready` |
| `worker` | `apps/worker` (set `Root Directory`) | `bun run --filter worker start` | none (BullMQ-driven) |
| `postgres` | Railway Postgres | — | — |
| `redis` | Railway Redis | — | — |

The worker MUST be its own service. A slow job otherwise blocks API requests; they also scale differently (API is request-bound, worker is queue-bound).

## Environments

- **Staging** and **production** are separate Railway projects with separate Postgres + Redis instances. Sharing a Postgres database across envs guarantees tenant-id collisions and is a hard no.
- Promote by image, not by overwriting prod env vars: deploy to staging, smoke-test, redeploy the same commit to prod.

## Required env vars (per service)

`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `CORS_ORIGINS`, `R2_*` (six vars), `VAPID_*` (three vars), `NODE_ENV=production`.

Optional: `ERROR_REPORTER_URL` (webhook for uncaught errors), `BOOTSTRAP_TOKEN` (only on api during initial super-admin seeding; remove after the first super-admin is promoted).

## Migrations

On every deploy, run before swapping:

```bash
bun run db:migrate:control      # control plane
bun run db:migrate:tenants      # fans out to every tenant schema
```

For risky tenant migrations, dry-run first:

```bash
bun packages/db/src/migrations/fanout.ts --dry-run
```

If a tenant fails, the fan-out reports a non-zero exit with the list. Fix the migration, then re-run targeted:

```bash
bun packages/db/src/migrations/fanout.ts --only-tenant <slug>
```

## Healthcheck

`/ready` checks Postgres (`SELECT 1`) and Redis (`PING`). Railway probes this on the API; if either is down, deploys block. `/health` remains as a "process is alive" liveness probe (no dependencies).

## Logs

Both services emit JSON-per-line via `apps/api/src/lib/log.ts` and `apps/worker/src/lib/log.ts`. Pipe Railway log drains to Logtail / Better Stack / Loki for retention + search.

## Error tracking

Set `ERROR_REPORTER_URL` to a Sentry HTTP webhook, Logtail HTTP source, or a Slack incoming webhook. The API forwards 5xx and unknown errors; the worker forwards failed jobs.

## Backup

Per the `backup-restore.md` runbook, schedule a daily `pg_dump --schema=tenant_*` for per-tenant backups + a full DB dump as belt-and-suspenders. Test restore quarterly.

## Horizontal scaling

The API can scale horizontally — sessions are DB-backed and the WebSocket layer uses Redis pub/sub to fan events across instances (`packages/queue/src/index.ts:realtimeChannel`). The worker can also scale horizontally; BullMQ + IORedis coordinate via Redis.

When scaling either past 2 replicas, switch from Railway's free Redis to a plan that supports `notify-keyspace-events Ex` (BullMQ uses keyspace notifications for delayed jobs).
