# Decision — Construction photo retention

**Status:** resolved (2026-05-26). Was open in README §9.

## Decision

- **Default: 365 days** after a property is archived.
- **Per-tenant configurable** via `tenant_config.photo_retention_days` (range 30–3650).
- Enforced by the daily `RETENTION_SWEEP` BullMQ job (see `apps/worker/src/jobs/retention-sweep.ts`).
- Only `property_assets` rows on `properties.status = 'ARCHIVED'` with `uploaded_at` older than the cutoff are removed; assets on live properties never expire.

## Why

- "Before" photos (TZ Sub-stage 1.1) and stage media are critical evidence during a project's life, but once a property closes and the certificate is generated, their value falls off. One year retains them for warranty/dispute season.
- Construction sites generate large volumes of photos; unbounded R2 storage is a real cost driver. A configurable retention lets tenants in regulated industries extend if needed.
- The handover certificate and final report PDF are themselves stored as `property_assets` (kinds `HANDOVER_CERTIFICATE`, `FINAL_REPORT`); when the property archives, those follow the same retention. Tenants that need permanent archival can set retention to 3650 (≈10 years) or extract via the admin export endpoint.

## How to apply

- Owners change retention via `PATCH /tenant/config` (Owner settings UI).
- The sweep runs daily at 03:00 UTC; manual trigger via `bunx bullmq` or enqueue an immediate job for one-off cleanups.
- R2 object deletion is best-effort: the DB row deletion is the source of truth, and leftover R2 objects are reaped on the next sweep when they re-appear as orphans (no FK between R2 and DB; sweep also catches direct R2 leaks).

## Cross-references
- PHASE-9 §9.3 — retention sweep
- README §9 — parked question now closed
