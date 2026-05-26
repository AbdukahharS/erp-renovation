# Runbook — Provision a tenant

## UI (preferred, post-Phase-9)

1. Sign in as a super-admin (`is_super_admin=true` on `public.user`).
2. Visit `/_admin/tenants`.
3. Click **Provision new tenant**, fill name / slug / owner email / name / password (≥12 chars).
4. On success, the new tenant appears in the list with status `ACTIVE` and a default `tenant_config` row (USD, 365d photo retention, 90d notification retention, balanced rating weights).

## CLI fallback

Set `BOOTSTRAP_TOKEN` and call:

```bash
bun scripts/provision-tenant.ts \
  --name "Acme Renovations" \
  --slug acme \
  --owner-email owner@acme.example \
  --owner-name "Owner" \
  --owner-password "<≥12-char password>"
```

This hits `POST /tenants` (the bootstrap path) which is unauthenticated but token-gated. Remove `BOOTSTRAP_TOKEN` from env after seeding the first super-admin to close the door.

## Seeding the first super-admin

1. Provision one tenant + owner via the CLI above (or sign up a user normally).
2. Promote that user:
   ```bash
   bun scripts/promote-super-admin.ts --email owner@acme.example
   ```
3. That user can now access `/_admin/*` and provision additional tenants via the UI.

## What provisioning does

1. Creates the `tenants` row (control plane).
2. Creates a Postgres schema `tenant_<32-char-uuid>`.
3. Inserts the owner `tenant_memberships` row with role `OWNER`.
4. Inserts a default `tenant_config` row (currency=USD, retention defaults, rating weights 0.5/0.5).
5. Runs the tenant migration set against the new schema.
6. Seeds the default template (8 stages / ~20 sub-stages / ~90+ control points).

## Troubleshooting

- **400 "slug already taken"**: pick another slug; `tenants.slug` is unique.
- **400 password length**: enforce ≥12 chars per `auth.ts` `minPasswordLength`.
- **500 schema creation failed**: confirm the Postgres user has `CREATE` on the database.
- **Default template missing**: rerun the fan-out (`bun packages/db/src/migrations/fanout.ts --only-tenant <slug>`); the seed-or-skip step fires when `templates` is empty.
