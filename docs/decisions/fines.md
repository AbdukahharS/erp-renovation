# Decision — Fines model

**Status:** resolved (2026-05-26). Was open in README §9 / PHASE-7.

## Decision

A fine is a **negative-amount transaction (type `FINE`) against the offending master's `master_balances`**, paired one-to-one with a row in `fines` that carries the inspector's reason and (optionally) the originating `rejection_id`. The fine immediately decrements the balance and feeds the property's Plan-vs-Actual on the same ledger every other transaction uses.

## Why

- **Single ledger.** Plan-vs-Actual already aggregates from `financial_transactions`. Modeling fines as a transaction type means the dashboard needs no special case.
- **Auditable.** The `fines` row stores `appliedBy`, `reason`, `rejectionId` and the linked `transactionId` — there is one authoritative row per fine, and the financial side is uneditable (transactions are append-only; corrections are paired reversals).
- **At most one fine per rejection.** `fines_rejection_unique` is a partial unique index, so an inspector can't double-fine the same defect.

## How to apply

- Apply via `POST /inspector/rejections/:rejectionId/fine` (see `apps/api/src/modules/finance/routes.ts:310`, `applyFine` in `service.ts:116`).
- To reverse: insert a paired `REVERSAL` transaction; do not edit the original row.
- The balance can go negative — that is intentional. Payouts subtract from balance; a master with a negative balance has earned less than the fines they owe.

## Cross-references
- PHASE-7 §7.3 — fines integration in finance dashboard
- README §9 — parked question now closed
