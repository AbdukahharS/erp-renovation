# Phase 9 — Hardening & SaaS Readiness

**Depends on:** all prior phases · **Est:** ~2 weeks · **Critical path:** no (but gates external clients)

## Goal

Turn a working internal pilot into something a third-party construction company can be onboarded onto safely. Tenant provisioning becomes a real flow rather than a script, the security posture is verified (especially the schema-per-tenant isolation that everything rests on), performance is acceptable under realistic data volumes, the deploy is production-grade, and the parked open questions are resolved. By the end, the product satisfies the TZ's "SaaS Readiness Requirements" (§5) and D1's "SaaS-ready from day one" goal in substance, not just in schema.

## Why now

D1/D2 made SaaS-readiness a first-class goal, and the schema was built for it from Phase 1 — but "the schema supports it" is not the same as "a stranger's company can be safely onboarded." This phase closes that gap. It's last because it hardens and verifies everything the prior phases built; doing it earlier would mean hardening a moving target.

## Scope

### 9.1 Tenant provisioning & lifecycle
- A real provisioning flow: create company account → create schema → run full tenant migration set → seed the default template (Phase 2) → create the first Owner user. Make this an Owner-facing or admin-facing flow, not a manual script.
- Tenant lifecycle: suspend, resume, and (carefully) offboard/export a tenant. Schema-per-tenant makes per-client backup/export clean (a stated D2 benefit — realize it here).
- Per-tenant configuration surfaced: currency (resolves the parked multi-currency question), target unit cost, rating formula weights (Phase 6), branding basics.

### 9.2 Isolation hardening & security
- **Re-verify the schema-per-tenant guarantee end-to-end** under every code path built since Phase 1: requests, BullMQ jobs (Phase 5), WebSocket subscriptions (Phase 8), R2 object keys (no cross-tenant object access), document generation (Phase 7). This is the highest-stakes audit in the project.
- Consider Postgres Row-Level Security as defense-in-depth on top of schema isolation (stack doc cites RLS for multi-tenant isolation) — decide whether to add it.
- Standard security pass: presigned-URL scoping via `Bun.s3` (a master can't request a URL for another tenant's object — enforce tenant-prefix validation in the URL-generation helper), auth session hardening, rate limiting on auth and upload endpoints, input validation coverage (Zod everywhere — audit for gaps), secrets management on Railway.
- R2 object key namespacing by tenant; verify no key collision or traversal across tenants.

### 9.3 Performance & scale
- Migration fan-out (Phase 1) at realistic tenant counts: applying a schema change across many tenant schemas must be operationally sane (timing, failure-recovery mid-fan-out).
- Query performance with realistic data (many properties × stages × checklist items × photos): index review on the per-tenant tables, especially the acceptance queue and dashboard aggregations.
- R2 photo volume: the TZ generates large volumes of construction-site photos; verify upload/serve performance and revisit the **parked photo-retention question** (cost driver).
- WebSocket horizontal-scale path (Redis pub/sub fan-out, noted in Phase 8) if more than one API instance is needed.

### 9.4 Production deploy
- Harden the Railway deploy: separate API + worker processes (Phase 5 decision), managed Postgres + Redis, environment separation (staging vs prod), health checks, log aggregation, error tracking.
- Document the migration path to AWS ECS/Kubernetes (stack doc) — not executed, but the runbook exists for when B2B scale justifies it.
- Backup strategy: per-tenant schema backups (D2 benefit), tested restore.

### 9.5 Resolve parked questions (README §9)
- **Fines model** — should be resolved by Phase 7; confirm and document.
- **Telegram vs Push priority** — confirm from Phase 8.
- **Photo retention** — set a policy (informs R2 cost and §9.3).
- **Multi-currency** — implement per-tenant currency or explicitly defer with a documented constraint.

### 9.6 Onboarding & docs
- Onboarding runbook for a new client tenant.
- Operational docs: how to run a migration across all tenants, how to back up/restore a tenant, how to provision/suspend, incident response for a suspected isolation breach.

## Out of scope
- The SaaS *billing* product (charging client companies subscription fees) — that's a commercial build of its own; this phase makes the product *ready* for it, with tenant lifecycle hooks, but doesn't implement billing.
- Auto-estimation / materials catalog (A2 — still deferred unless reprioritized).
- The Procurement interface (A1 — still deferred unless reprioritized).
- Self-serve public signup funnel (provisioning is admin/owner-driven; public funnel is a later commercial decision).

## Data model touched
- **Control plane**: tenant lifecycle status, per-tenant config (currency, target cost, rating weights, branding), provisioning audit log.
- Mostly hardening/indexing existing per-tenant tables rather than new domain tables.

## Key risks & decisions
- **The isolation re-audit is the make-or-break of the SaaS promise.** A single cross-tenant leak in any path (request, job, socket, storage, document) invalidates the entire D1/D2 premise. Treat this audit as the most important deliverable of the phase. Automate as many cross-tenant negative tests as possible and keep them permanently in CI.
- **Migration fan-out at scale**: a failure halfway through applying a migration to tenant #37 of 100 must be recoverable. Make fan-out resumable and idempotent.
- **Photo-retention vs cost**: unbounded R2 growth from construction photos is a real cost; the retention policy is both a product and a finance decision.
- **RLS-as-defense-in-depth decision**: adds complexity but a strong safety net under schema isolation. Decide explicitly.

## Definition of Done
- [ ] A new client tenant can be provisioned end-to-end (schema + migrations + default template + Owner user) through a real flow, not a manual script.
- [ ] The cross-tenant isolation guarantee is re-verified across requests, jobs, sockets, storage, and documents, with automated negative tests in CI.
- [ ] A schema migration fans out across all tenants safely and resumably; per-tenant backup + restore is tested.
- [ ] Performance is acceptable on realistic data volumes (acceptance queue, dashboard, photo upload/serve), with indexes reviewed.
- [ ] Production deploy has staging/prod separation, separate API/worker processes, health checks, logging, and error tracking.
- [ ] All parked questions (fines, Telegram/Push priority, photo retention, multi-currency) are resolved and documented.
- [ ] Onboarding + operational runbooks exist, including isolation-breach incident response.
