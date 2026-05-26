# Runbook — Suspend / offboard a tenant

Three states: `ACTIVE` → `SUSPENDED` → soft-deleted → physically purged.

## Suspend (reversible)

```bash
curl -X POST https://api.example.com/admin/tenants/<id>/suspend \
  -H "Cookie: <super-admin session>"
```

Effect:
- `tenants.status = 'SUSPENDED'`.
- Tenancy plugin (`apps/api/src/modules/tenancy/plugin.ts`) starts returning 409 for all tenant-scoped routes.
- Active sessions for this tenant get 409 on next request; users see an error and bounce.
- BullMQ jobs already in flight finish; new jobs for this tenant continue to run (they're tenant-scoped via `withTenant`).

Use case: missed billing, suspected abuse, paused engagement.

## Resume

```bash
curl -X POST https://api.example.com/admin/tenants/<id>/resume \
  -H "Cookie: <super-admin session>"
```

Sets `status = 'ACTIVE'`. Users can sign in again.

## Offboard step 1 — export

Before deletion, hand the tenant their data:

```bash
curl https://api.example.com/admin/tenants/<id>/export \
  -H "Cookie: <super-admin session>" -o tenant.json
```

Or per `backup-restore.md` use `pg_dump --schema=tenant_<uuid>` for a structured dump.

## Offboard step 2 — soft delete

```bash
curl -X DELETE https://api.example.com/admin/tenants/<id> \
  -H "Cookie: <super-admin session>"
```

Effect:
- `tenants.status = 'SUSPENDED'` and `tenants.deleted_at = now()`.
- Schema remains intact; data is recoverable by un-soft-deleting (clear `deleted_at`).
- Admin list endpoint hides soft-deleted tenants.

Wait period: at least 30 days before physical purge (let the client come back if they made a mistake).

## Offboard step 3 — physical purge

```bash
curl -X DELETE "https://api.example.com/admin/tenants/<id>?purge=true" \
  -H "Cookie: <super-admin session>"
```

Effect:
- `DROP SCHEMA "tenant_<uuid>" CASCADE`.
- Delete `tenants` row + cascade `tenant_memberships`, `tenant_config`, `invitations`.
- **Irreversible.** R2 objects under the tenant's prefix are NOT auto-deleted here — run an out-of-band sweep:
  ```bash
  # rclone or aws s3 rm
  rclone delete r2:erp-prod/tenant_<uuid>/
  ```

Without the `?purge=true` flag, the endpoint defaults to soft-delete (returns `softDeleted: true`). The two-step gate is intentional — physical purge is a confirmed action.

## What survives a tenant deletion

- Nothing inside the tenant schema (it's DROPped).
- `public.user` rows are NOT cascaded — a user who was only ever in this tenant still exists. To remove that user, delete them separately. (Users can belong to multiple tenants, so deletion is intentional, not automatic.)
- Backups in object storage survive per the backup retention policy (typically 90 days).
