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
- Per-property financial dashboard (Owner desktop): planned unit cost (fixed at creation, A2) vs. actual = accrued wages (from Phase 5) + material costs.
- **Material costs**: since auto-estimation is deferred (A2), provide manual material-cost entry against a property so Actual is complete. This is the seam where the future Materials module (A2) plugs in.
- Real-time-ish: updates on navigation/refetch (A5 — WebSocket live updates are Phase 8). Invalidate the property's finance query after each accept (the mutation already fires in Phase 5).
- Profitability indicator: green marker if kept within the target ($230/unit or tenant's configured target), per TZ §8.2.

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
- Auto-generated estimates / materials catalog (A2 — deferred; manual material-cost entry stands in).
- Real payment-rail / banking integration (manual "mark paid").
- Live WebSocket dashboard updates (Phase 8).
- Tenant-level billing for the SaaS product itself (Phase 9 — that's *our* revenue, distinct from per-property economics).
- Multi-currency (parked; $ assumed — Phase 9 if needed).

## Data model touched
- **Per-tenant**: `material_costs` (manual entry), `fines` (transaction subtype), `unit_closings`, `final_reports`, handover-certificate asset references; payout-settlement markers on balances.
- `packages/validators`: material-cost, fine, closing, report schemas.

## Key risks & decisions
- **Plan-vs-Actual accuracy depends on capturing all costs.** With materials manual (A2), the number is only as good as the data entered — make material-cost entry prominent so Actual isn't silently incomplete. Flag properties with no material costs entered as "estimate incomplete."
- **Resolve fines now** (parked since README §9). Recommendation: fine = a negative transaction against the master's balance, with a reason + the originating rejection — keeps the financial ledger single-source.
- **Document generation on Bun**: pick a PDF approach that works under Bun and is tenant-safe (no cross-tenant data in a shared template cache).
- **Closing is irreversible-ish**: define whether a closed property can be reopened (recommendation: closing is reversible by Owner only, audited, before archive finalization).
- **Net profit definition**: confirm the formula (planned cost − wages − materials − transport? TZ §8.2 lists "material costs, paid master wages, transportation expenses"). Add a transport-cost entry alongside materials.

## Definition of Done
- [ ] Owner sees per-property Plan-vs-Actual with accrued wages (auto from Phase 5) + manually entered material/transport costs, and a green/over-budget indicator.
- [ ] Masters see their virtual balance and transaction history; Owner can mark payouts settled.
- [ ] Inspector can apply a fine; it reflects correctly in balance and property economics (fines decision resolved + documented).
- [ ] Accepting the final stage makes the property closeable; the final-audit flow uploads portfolio photos and runs the closing checklist.
- [ ] Closing generates the final financial report + net profit, triggers the defect-summary rating adjustment, generates the handover certificate, and archives the property as Completed.
