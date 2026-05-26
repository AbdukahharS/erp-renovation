# Decision — Multi-currency

**Status:** resolved (2026-05-26). Was open in README §9.

## Decision

- **One currency per tenant**, stored in `tenant_config.currency_code` (ISO 4217, default `USD`).
- Amounts in `financial_transactions`, `master_balances`, `property_costs`, `fines`, `payout_settlements`, `properties.planned_unit_cost`, `sub_stage_instances.wage_amount` remain `numeric(14,2)` — **no per-row currency column**.
- Currency is **display-only**: UI formats with `Intl.NumberFormat(currencyCode)` via `apps/web/src/lib/format-money.ts`.
- Changing `currency_code` is rejected if any non-archived property exists (HTTP 409). To migrate currency, archive all properties first.

## Why

- Mixing currencies inside one tenant's ledger breaks the dashboard's Plan-vs-Actual unless every aggregation knows the FX rate at each transaction's instant — order-of-magnitude more complexity than the ERP needs.
- Tenants serve one geography. A tenant operating in EUR sets `currency_code = EUR` once at provisioning; all dashboards, reports, certificates render in EUR thereafter.
- The 409 guard prevents an Owner from silently breaking a live ledger; the explicit "archive everything first" workflow forces the right reasoning.

## How to apply

- Set at provisioning (defaults to USD) — Owner can change later via Settings UI while no properties are live.
- Final reports and handover certificates render via React-PDF and pick currency up from the same `tenant_config` row at generation time.

## Cross-references
- PHASE-9 §9.1 — per-tenant config
- README §9 — parked question now closed
