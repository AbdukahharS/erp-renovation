# Runbook — Tenant migration fan-out

Tenant schemas live separately from the control plane; new tenant migrations apply against each tenant schema individually. The fan-out runner does this in one pass and is resumable.

## Normal deploy flow

```bash
bun run db:migrate:control   # control plane (single schema)
bun run db:migrate:tenants   # iterates every tenant schema
```

The fan-out tracks which (schema, migration_tag) pairs have applied via `public.tenant_migrations` — re-running is idempotent.

## Dry-run

Before risky migrations, preview what would apply:

```bash
bun packages/db/src/migrations/fanout.ts --dry-run
```

Output lists every pending `(schemaName, tag)` without writing.

## Targeting one tenant

After fixing a tenant-specific issue:

```bash
bun packages/db/src/migrations/fanout.ts --only-tenant <slug>
# or by schema name:
bun packages/db/src/migrations/fanout.ts --only-schema tenant_<uuid>
```

## Partial failure

If a migration fails on tenant X, the runner:
1. Logs `[tenant:tenant_X] FAILED <tag>: <error>`
2. Records the failure in the result summary
3. **Continues to tenant Y** (per-schema isolation)
4. Exits with code 1 if any tenant failed

The summary at the end lists every failure with its error message. Common pattern: one tenant has data that violates a new constraint. Fix the data (or write a backfill migration), then rerun with `--only-tenant <slug>`.

## Writing a new tenant migration

1. Create the SQL file: `packages/db/drizzle/tenant/0012_phase10_thing.sql`.
2. Use `--> statement-breakpoint` between statements.
3. Test locally: `bun packages/db/src/migrations/fanout.ts --dry-run` then full run.
4. Commit. The CI pipeline runs the fan-out as part of `bun run test`.

## Rolling back

There is no automatic rollback. To revert: write a new migration (`0013_revert_thing.sql`) that drops the columns/tables and run the fan-out forward.
