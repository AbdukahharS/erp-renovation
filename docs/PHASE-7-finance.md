# Phase 7 — Finance & Unit Economics

**Depends on:** Phase 5 (consumes the transactions/balances it writes) · **Est:** ~2 weeks · **Critical path:** yes (for a usable pilot)

## Goal

The money becomes visible and the unit closes. The Owner sees each property's real-time profitability (Plan vs. Actual) — planned unit cost against accrued wages and material costs — and masters can see their virtual balances. When the last stage is accepted, the property can be formally closed: a final financial report and net-profit figure are generated, the acceptance/handover certificate is produced, and the property moves to archived "Completed." By the end, a property driven through the full pipeline produces a complete, accurate financial picture and a closed unit.

## Why now

Finance reads what Phase 5 writes (balances, transactions, budget decrements), so it must follow automation. It completes the critical path to a usable internal pilot — without it, stages close and wages credit, but nobody can *see* the unit economics that are the whole point of the assembly-line model (TZ Module 5). It precedes the SaaS-hardening phase because the financial model needs to be right before clients touch it.

## Scope

### 7.1 Virtual balances & transactions
- Master balance view (PWA): current credited balance, transaction history (which stages, which properties paid out). Reads Phase 5's `master_balances` + `financial_transactions`.
- Owner view of all balances/payroll liability across the tenant.
- **Payout/withdrawal**: decide scope. Recommendation for first release: track the balance and mark payouts as settled manually (a "mark paid" action); real payment-rail integration is out of scope.

### 7.2 Plan-vs-Actual dashboard
- Per-property financial dashboard (Owner desktop), at `/owner/properties/$propertyId/finance`: planned unit cost (fixed at creation, A2) vs. actual = accrued wages (from Phase 5) + material costs (from §7.2.1) + other off-warehouse costs (from §7.2.2).
- Real-time-ish: updates on navigation/refetch (A5 — WebSocket live updates are Phase 8). Invalidate the property's finance query after each accept (the mutation already fires in Phase 5).
- Profitability indicator: green marker if kept within the target ($230/unit or tenant's configured target), per TZ §8.2.

### 7.2.1 Warehouse & material issuances (shipped — supersedes the manual-entry stand-in)
The earlier draft said material costs would be entered as free-form line items against a property. That stand-in has been replaced by a real warehouse/materials model. Per-stage auto-estimation (A2) is still deferred, but every actual material cost on a property now flows through warehouse issuances.

- **One implicit warehouse per tenant** — the tenant schema *is* the warehouse; no `warehouses` table.
- **`materials`** — name, category, `unit` (`pcs | m | m2 | m3 | kg | l`), current `price`, `archivedAt`. Unique on `(name)` while active.
- **`material_movements`** — append-only ledger: `RECEIPT | ISSUANCE | ADJUSTMENT | REVERSAL`, signed `delta` (3dp for fractional kg/m), optional `unit_price_snapshot`, `actorUserId`, `reason`. **On-hand is never stored — it is `SUM(delta)` per material.** The ledger is the single source of truth for stock.
- **`material_issuances`** — one row per "Owner sends material X to property Y": `propertyId`, `materialId`, `quantity`, `unit_price_snapshot` (price frozen at issuance time), computed `amount`. Pairs **one-to-one** with a `MATERIAL_COST` row in `financial_transactions` (drives Plan-vs-Actual) and the negative-delta `ISSUANCE` row in `material_movements` (drives stock). Reversal stamps `reversedAt/reversedBy` and inserts inverse rows in both ledgers — the original rows stay intact for audit (same pattern as `reversePropertyCost`).
- **Owner flow (UI)**: on the per-property finance page, the **Issue Materials** dialog accepts N lines of `{ materialId, quantity, note }` and posts to `POST /warehouse/issuances`. The endpoint locks involved materials in id order to serialize concurrent issuances, validates `requested ≤ on-hand` per line, snapshots the current price, and inserts the three linked rows per line atomically. Disabled once the property is `ARCHIVED`. Reversal via `POST /warehouse/issuances/:id/reverse` (blocked on archived properties).
- **Why this matters for Plan-vs-Actual**: Actual material cost on a property is now the sum of non-reversed `MATERIAL_COST` transactions tied to its issuances — accurate by construction, not by data discipline.

### 7.2.2 Off-warehouse costs (the remaining manual seam)
Free-form `property_costs` (recorded via `addPropertyCost` / `reversePropertyCost`) remain for expenses that don't flow through the warehouse: transport, external-contractor flat fees (e.g. cleaning per A7), one-off services. The `MATERIAL` category is intentionally **not** exposed for free-form entry — material cost originates exclusively from warehouse issuances so the ledgers stay consistent.

### 7.3 Fines (parked decision)
- The Inspector "apply fines for defects" right (TZ §2) lands here financially. **Resolve the parked fines decision** (flat fine vs balance deduction). Model fines as a transaction type (anticipated in Phase 5's schema). Inspector UI to apply a fine; it reflects in the master balance and property economics.

### 7.4 Unit closing (business-process step 6 / TZ Stage 8.2)
- When the last production stage is accepted, the property becomes final-acceptance-eligible.
- **Role mapping (per A7)**: the TZ's "Manager" is the **Owner** role; the "Chief Technical Supervisor" who does the final audit is an **Inspector** carrying a closing permission (not a separate role). The final-audit flow is gated by that permission, not a new enum value.
- Final audit flow (Owner or closing-permitted Inspector): client-handover readiness checklist, upload of finished portfolio photos (R2).
- **Cleaning stage assignment (TZ Stage 8.1, "Cleaning Company" contractor)**: there's no dedicated cleaning role in the enum (A7). Model professional cleaning as a normal stage in the template whose performer is a **Master flagged as an external contractor** (a boolean on the master/assignment, not a new role). The cleaning checklist (8.1) runs through the standard acceptance loop like any other stage; "external contractor" just signals they're not a regular wage-rated master and may be paid outside the per-m² model. Decide whether cleaning carries a wage line or a flat external-cost entry (recommend: flat cost recorded like materials).
- **System actions on close**:
  - Consolidate all transactions → final Plan-vs-Actual report and net profit.
  - Defect summary: pull rejection counts per stage (Phase 4 data) into the report and trigger the rating adjustment (Phase 6).
  - Generate the acceptance/handover certificate document.
  - "Property Successfully Completed" → status `COMPLETED`, then `ARCHIVED`.

### 7.5 Document generation
- The handover certificate and final financial report as generated documents (PDF). Decide the generation approach; keep it server-side and tenant-scoped.

## Out of scope
- **Auto-estimation from templates** (per-stage quantity formulas → predicted material draw). A2 still deferred. The materials catalog and warehouse ledger (§7.2.1) exist; auto-estimation against them is a future module.
- Real payment-rail / banking integration (manual "mark paid").
- Live WebSocket dashboard updates (Phase 8).
- Tenant-level billing for the SaaS product itself (Phase 9 — that's *our* revenue, distinct from per-property economics).
- Multi-currency (parked; $ assumed — Phase 9 if needed).

## Data model touched
- **Per-tenant**: `materials`, `material_movements`, `material_issuances` (§7.2.1); `property_costs` for off-warehouse expenses (§7.2.2); `fines` (transaction subtype), `unit_closings`, `final_reports`, handover-certificate asset references; payout-settlement markers on balances. `financial_transactions` carries a `MATERIAL_COST` type populated exclusively by warehouse issuances.
- `packages/validators`: material, issuance, property-cost, fine, closing, report schemas.

## Key risks & decisions
- **Plan-vs-Actual accuracy depends on capturing all costs.** Material cost is now ledger-driven (§7.2.1) so it's accurate by construction. The remaining gap is off-warehouse expenses (transport, external contractors) entered via free-form `property_costs` — flag properties with suspiciously empty cost rolls as "estimate incomplete."
- **Resolve fines now** (parked since README §9). Recommendation: fine = a negative transaction against the master's balance, with a reason + the originating rejection — keeps the financial ledger single-source.
- **Document generation on Bun**: pick a PDF approach that works under Bun and is tenant-safe (no cross-tenant data in a shared template cache).
- **Closing is irreversible-ish**: define whether a closed property can be reopened (recommendation: closing is reversible by Owner only, audited, before archive finalization).
- **Net profit definition**: confirm the formula (planned cost − wages − materials − transport? TZ §8.2 lists "material costs, paid master wages, transportation expenses"). Add a transport-cost entry alongside materials.

## Definition of Done
- [ ] Owner sees per-property Plan-vs-Actual with accrued wages (auto from Phase 5) + materials cost (auto from warehouse issuances, §7.2.1) + off-warehouse costs (manual, §7.2.2), and a green/over-budget indicator.
- [ ] Owner can browse the materials catalog, record receipts/adjustments, and issue materials to a property from the property's finance page; issuance reverses cleanly via inverse ledger rows.
- [ ] Masters see their virtual balance and transaction history; Owner can mark payouts settled.
- [ ] Inspector can apply a fine; it reflects correctly in balance and property economics (fines decision resolved + documented).
- [ ] Accepting the final stage makes the property closeable; the final-audit flow uploads portfolio photos and runs the closing checklist.
- [ ] Closing generates the final financial report + net profit, triggers the defect-summary rating adjustment, generates the handover certificate, and archives the property as Completed.
