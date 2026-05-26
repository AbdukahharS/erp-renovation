# Runbook — Backup and restore

## Strategy

- **Daily full database dump** to off-site object storage (Railway Postgres → S3/R2/Backblaze).
- **Per-tenant schema dumps** are the right granularity for client offboarding ("give me my data") — D2's schema-per-tenant lets these be clean.
- **Quarterly restore drill** against a fresh Railway environment to prove backups actually restore.

## Full database backup

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner --no-acl \
  -f erp-$(date +%Y%m%d).dump
```

Upload the dump to long-term storage with at least 90-day retention.

## Per-tenant export (use case: client offboarding)

Two equivalent paths:

### Admin endpoint (JSON)

```bash
curl -X GET https://api.example.com/admin/tenants/<tenant-id>/export \
  -H "Cookie: <super-admin session>" -o tenant-export.json
```

Returns `{ schemaName, exportedAt, tables: { <table_name>: [rows] } }`.

### `pg_dump --schema`

```bash
pg_dump "$DATABASE_URL" \
  --schema=tenant_<uuid> \
  --format=custom \
  --no-owner --no-acl \
  -f tenant-<slug>.dump
```

Hand the dump to the client; they restore with `pg_restore` against any Postgres ≥ 14.

## Restore

### Full

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "$DATABASE_URL" erp-YYYYMMDD.dump
```

After restore, validate by visiting `/ready` (DB + Redis) and `/admin/tenants` (super-admin list).

### Single tenant

```bash
pg_restore --schema=tenant_<uuid> --no-owner --no-acl \
  -d "$DATABASE_URL" tenant-<slug>.dump
```

Then re-insert the corresponding `tenants` and `tenant_memberships` rows in the control plane if they were lost.

## What to check after a restore

1. `bun run db:migrate:control` (control plane is current).
2. `bun packages/db/src/migrations/fanout.ts --dry-run` (no pending tenant migrations).
3. Spot-check a tenant via `/auth/me` + `/tenant/whoami` as that tenant's owner.
4. Confirm BullMQ has no permanently-failed jobs from the outage window.

## Quarterly drill checklist

- [ ] Provision a clean Railway env from staging templates.
- [ ] Restore the most recent full backup.
- [ ] Run the migration fan-out (dry-run + apply).
- [ ] Sign in as a known tenant owner; walk one property through one acceptance.
- [ ] Confirm latest backups are in object storage and downloadable.
- [ ] Note total restore wall-clock time; flag if > 30 minutes.
