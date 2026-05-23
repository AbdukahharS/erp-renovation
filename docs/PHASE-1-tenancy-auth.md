# Phase 1 — Tenancy & Auth

**Depends on:** Phase 0 · **Est:** ~2 weeks · **Critical path:** yes

## Goal

The system knows who you are, which company (tenant) you belong to, and what role you hold — and every data path is isolated to your tenant's Postgres schema. By the end, you can: create a tenant (company account), register/log in users into it, assign one of four roles, and have the API resolve a tenant context on every request that routes all queries into that tenant's schema. The frontend renders a different shell per role and guards routes by role. This phase contains zero renovation features and is the most important phase in the project: **D2 (schema-per-tenant) is realized here or never cheaply.**

## Why now

Decisions D1 and D2 make tenancy the substrate, not a feature. If tenant resolution and schema routing aren't proven before any domain table exists, every later table and query is written tenant-unaware and has to be retrofitted — exactly the migration pain D2 was chosen to avoid. Auth and the role model gate every UI surface (D3's four interfaces), so they must exist before there's anything to gate.

## Scope

### 1.1 Tenant model & schema-per-tenant mechanics
- A **control-plane schema** (shared, e.g. `public`) holding the tenant registry: tenant id, name, status, schema name, created-at.
- A **tenant provisioning routine**: creating a tenant creates a new Postgres schema and runs the tenant migration set into it. This is the heart of D2.
- A **tenant-context resolver** in Elysia (a plugin, mapping to the stack doc's plugin-per-boundary model): resolve tenant from the authenticated session, then scope the Drizzle client's `search_path` (or per-request schema-bound client) for the rest of the request.
- Decide and document: one Drizzle client with dynamic `search_path` per request vs. a client factory per tenant. (Recommendation: dynamic `search_path` set per request inside the resolver — simplest correct option for Postgres schema-per-tenant.)

### 1.2 Auth (Better Auth)
- Better Auth wired to Elysia + Bun, no adapter hacks (per stack doc).
- Email/password to start; session carries `tenantId` + `role` as custom session data.
- Users live in the control plane keyed to a tenant, OR per-tenant — **decide and document.** Recommendation: user identity in the control plane (so a person could later belong to multiple tenants), tenant membership + role as the join. This keeps the SaaS story clean.
- `auth` module in `apps/api/src/modules/auth/` with role guards exposed as reusable Elysia guards.

### 1.3 Four-role model
- Role enum: `OWNER`, `INSPECTOR`, `MASTER`, `PROCUREMENT` (A1 — procurement role exists now, UI later).
- Role guards on routes; a guard helper that asserts role membership and 403s otherwise.
- Seed a tenant + one user per role for development.

### 1.4 Frontend auth & role-gated shells
- `apps/web/src/lib/auth.ts`: auth client + session helpers.
- `_auth/` route group: login page, session bootstrapping.
- Role-based route groups per the stack doc tree: `_owner/`, `_inspector/`, `_master/` — typed TanStack Router guards that redirect by role. (Procurement shell stubbed, A1.)
- Each shell is a distinct layout: Owner = desktop-dense; Inspector/Master = PWA, large-button, touch-first (D3).
- Login → land in the correct shell for your role; deep-linking into another role's route redirects.

### 1.5 Tenant isolation verification
- A test that proves cross-tenant leakage is impossible: seed two tenants, authenticate as tenant A, attempt to read tenant B's data, assert it's invisible. **This test is permanent and runs in CI forever.**

## Out of scope
- Any renovation domain tables (Phase 2+).
- Invite-link registration for masters (Phase 6 owns the HR flow; basic registration is enough here).
- SSO / OAuth providers (Phase 9 if ever).
- Self-serve tenant signup UI (Phase 9 — provisioning is programmatic/admin here).

## Data model touched
- **Control plane**: `tenants`, `users`, `tenant_memberships` (user↔tenant↔role).
- **Per-tenant**: nothing yet — but the migration-runner that populates a new tenant schema is built and exercised (even if the tenant migration set is currently empty/trivial).
- `packages/validators`: auth + role schemas.

## Key risks & decisions
- **Schema-per-tenant + Drizzle**: Drizzle doesn't have first-class multi-schema-switching ergonomics. The `search_path`-per-request approach must be airtight — a leaked connection with the wrong `search_path` is a cross-tenant data breach. Connection pooling interacts with this: ensure `search_path` is set per checkout, not per pool. **This is the single highest-risk item in the whole project.**
- **Migrations across N tenant schemas**: applying a new migration must fan out across every tenant schema. Build a migration-fan-out runner now; you'll lean on it every future schema change.
- **Open decision**: control-plane users vs per-tenant users (recommendation above — confirm).
- **Better Auth + custom session data + Elysia guards**: verify the session shape carries tenant+role reliably before building guards on top.

## Definition of Done
- [ ] Programmatically provisioning a tenant creates a new schema and runs the (currently minimal) tenant migration into it.
- [ ] Login establishes a session carrying `tenantId` + `role`.
- [ ] Every request resolves tenant context; queries hit only that tenant's schema.
- [ ] The cross-tenant leakage test passes and is in CI.
- [ ] Each of the four roles lands in its own gated shell; cross-role deep links redirect.
- [ ] A new schema migration can be fanned out across all existing tenant schemas with one command.
