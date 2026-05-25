# Phase 6 — HR & Master Database

**Depends on:** Phase 4 (consumes accept/reject events; Phase 5 helpful but not strictly required) · **Est:** ~1.5 weeks · **Critical path:** no

## Goal

The system aggregates and manages the master workforce: masters self-register via invitation links, carry a profile (specialization, contacts), accrue an automatic rating from their work speed and defect count, and broadcast an availability status the Owner and Inspector can see. By the end, the Owner has a real HR view of the contractor pool, and assignment decisions (who gets notified for an available stage) can draw on specialization + availability + rating.

## Why now

The TZ frames this as enabling the plan to "attract narrowly specialized professionals through targeted advertising" — it's how the workforce gets into the system at scale. It depends on the accept/reject events (Phase 4) and rejection records to compute ratings, and on the stage-assignment data to compute speed. It's *not* on the critical path to a working pipeline (Phase 5 can notify masters crudely), so it sits after the core loop is proven. Doing it before Finance (Phase 7) is sensible because ratings and the defect summary feed the unit-closing report.

## Scope

### 6.1 Master profiles & onboarding
- Master application form: full name, specialization(s) (electrician, tiler, plumber… — tie to the `specializations` from Phase 2), contact details.
- **Invitation-link registration** (TZ: "quick registration via an invitation link"): the Owner generates a tenant-scoped invite link; the master self-registers into the tenant with the `MASTER` role (reuses Phase 1 auth/membership). The link is single-use or expiring — decide.

### 6.2 Rating system (automatic)
- Rating computed from work speed (actual vs standard duration per stage, using Phase 3 schedule data + Phase 4 timestamps) and defect count (rejections from Phase 4).
- Recompute on each accept/reject event. Decide the formula and make it tenant-configurable later (SaaS) but ship a sensible default now.
- Rating is read by the assignment/notification logic so better masters can be prioritized (optional refinement) and by the Phase 8 unit-closing defect summary.

**Implementation note (Phase 6 deferral):** The current implementation stores only raw counters (`acceptedCount`, `rejectedCount`, `avgDurationRatio`) in `master_ratings`. The composite score formula and tenant-configurable weights are deferred to **Phase 9** along with per-tenant config. All inputs the formula will need are already captured and recomputed correctly, so adding the formula later requires no backfill. UI surfaces the raw counters in the meantime.

### 6.3 Availability schedule
- Master status visualization: "Available" / "On property X until [date]" (TZ Module 4). Derive "on property until" from active stage assignments + stage durations where possible, with manual override.
- Owner/Inspector see availability when deciding assignments.

### 6.4 Procurement role note (A1)
- This phase is a natural point to *optionally* surface the deferred Procurement interface, since it's HR-adjacent and the role already exists from Phase 1. **Default: still deferred** per A1; flagged here as the cheapest insertion point if priorities change.

## Out of scope
- Wage payout / withdrawal from the virtual balance (Phase 7 owns finance; balances are credited in Phase 5).
- Targeted advertising / external recruitment funnels (out of system scope entirely).
- Procurement UI unless explicitly pulled in (A1).
- Skills verification / document upload for masters (future; not in TZ).

## Data model touched
- **Per-tenant**: `masters` (profile, extending the user/membership from Phase 1), `master_specializations`, `invitations`, `master_ratings` (or computed view + cached score), `availability` (derived + override).
- `packages/validators`: master profile, invitation, rating schemas.

## Key risks & decisions
- **Rating formula is a business decision, not a technical one.** Ship a transparent default (e.g. weighted speed score minus defect penalty) and make it explainable — masters will dispute opaque ratings. Keep the inputs (timestamps, rejection counts) as raw data so the formula can change without data loss.
- **Invite-link security**: tenant-scoped, expiring, single-use. A leaked link must not allow joining the wrong tenant or escalating role.
- **"On property until" derivation** can be noisy if stages run long; allow manual override and treat the derived value as a default.
- **Open decision**: does rating affect *who can take* a stage, or only inform the Owner? Recommendation: inform only, for now — auto-gating on rating is a policy feature for later.

## Definition of Done
- [ ] Owner generates a tenant-scoped invite link; a master self-registers through it into the correct tenant with the Master role.
- [ ] Master profiles carry specialization(s) and contacts and appear in the Owner's HR view.
- [ ] Rating recomputes automatically from accept/reject events and stage timing, with a documented default formula.
- [ ] Master availability ("Available" / "On property X until …") is visible to Owner and Inspector.
- [ ] Notification targeting (Phase 5) can filter candidate masters by specialization + availability.
