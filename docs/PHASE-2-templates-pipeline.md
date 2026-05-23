# Phase 2 — Templates, Checklists & Pipeline Engine

**Depends on:** Phase 1 · **Est:** ~2–3 weeks · **Critical path:** yes

## Goal

A data-driven engine that defines *how renovation works* for a tenant: an ordered chain of stages, each with a typed checklist, a standard duration, and a wage rate — all editable by the Owner, all per-tenant. By the end, the Owner can view and edit the default template (seeded from the TZ's **8 stages / ~20 sub-stages / ~90+ control points**), and the pipeline's blocking rules exist as data the rest of the system reads. This phase builds the *rules*, not yet a property running through them — but it's the spine everything else hangs on (A3).

## Why now

Per A3, the template/checklist engine is the core SaaS differentiator and must be data-driven from the start; hardcoding checklists and retrofitting an engine would force a rewrite of the pipeline module. Properties (Phase 3) instantiate from templates, acceptance (Phase 4) reads checklists, automation (Phase 5) reads the stage order and wage rates, finance (Phase 7) reads the rates. Nothing downstream can be built until the template shape is settled. It comes right after tenancy because templates are per-tenant data and need the schema-routing from Phase 1.

## Scope

### 2.1 Template & stage schema
- A **template** = an ordered set of **stages** belonging to a tenant. The TZ default has 8 stages with sub-stages (e.g. Stage 1 Property Preparation → 1.1/1.2/1.3). Model the stage tree: stages contain sub-stages; sub-stages are the actual work units that get assigned, completed, and accepted.
- **Canonical-source note (resolves the TZ's own inconsistency)**: TZ Module 1 says "a sequence of X steps," workflow step 1 says "e.g., 15 standard steps," but the detailed checklist section enumerates **8 stages decomposing into ~20 sub-stages**. This plan treats the **detailed checklist section as canonical** (the ~20 sub-stages are the real work units; the "15 steps" is an illustrative aside, and ~20 sub-stages is in its spirit). No stage chain is lost — the count just resolves upward.
- Each work unit (sub-stage) carries: order/sequence, **performer type** (`MASTER` for work stages, `INSPECTOR` for inspection-only stages like Sub-stage 1.1 Initial Property Acceptance), required master specialization where applicable (electrician, plumber, tiler…), standard duration, wage rate (per A4: per-m² rate; zero for inspection-only stages), and a flag for whether media upload is mandatory (TZ: most are).
- A template is versioned or copy-on-edit — **decide** (recommendation: copy-on-instantiate so editing a template never mutates in-flight properties; see Phase 3).

### 2.2 Checklist schema (data-driven)
- Each work unit has a checklist: an ordered list of **control points** (the Yes/No items from the TZ). Store as structured rows, not free text, so they're queryable and the engine can enforce completeness. Control points carry an optional **description/criteria field** for the TZ items that have measurable thresholds (e.g. the 3.2 pressure-test "10 bar / 30 min", the 5.3 oblique-light check) — the bare boolean isn't enough for those.
- **Media-report requirements** per work unit (the "task completion blocker" lists) modeled as structured requirements. Per **A6**, each requirement has a media-type field accepting **photo and/or video** — the TZ says "photo/video report" throughout. Photo is the enforced blocker; video is an allowed optional attachment unless a tenant marks it required.
- JSONB (per stack doc) is acceptable for the flexible per-stage-type checklist payload where structure varies, but the *control points themselves* should be queryable rows so the Inspector UI and rating logic can count them.

### 2.3 Blocking / sequencing rules as data
- The inviolable sequence (TZ §3 Module 2) is encoded as ordering + a "blocked until previous accepted" rule. This phase stores the rule; Phase 4 enforces it at acceptance time. Model it so a tenant can later define non-linear chains (SaaS requirement TZ §5) — but the default is strictly linear.
- **Inspector manual block/unblock (TZ §2 right)**: the schema also models a **manual override** flag on a stage-instance dependency — the Inspector's explicit right to block/unblock subsequent stages independent of the automatic accept-driven flow. Phase 2 stores the capability; Phase 4 gives the Inspector the control. This is distinct from the automatic unlock and was a gap in the earlier draft.

### 2.4 Seed the default template
- Encode the TZ's full content as the seed default template for new tenants: **8 stages, ~20 sub-stages, all ~90+ control points, every media requirement, specializations, and durations** — including **Sub-stage 1.1 (Initial Property Acceptance) as the template's first stage, typed `INSPECTOR`** (it's the Ready-for-Production gate; see Phase 3 §3.5). This seed *is* the proof the engine is expressive enough — if the TZ checklists don't fit the schema, the schema is wrong. Validate the schema against **every** TZ control point during seeding, especially the threshold-bearing ones (pressure test, oblique-light, slope tolerances).
- Tenant provisioning (Phase 1) now seeds this default template into the new tenant's schema.

### 2.5 Owner template-authoring UI
- Owner desktop interface to view the stage chain, reorder stages, edit checklists (add/remove/edit control points), set durations and wage rates, toggle photo requirements.
- This is the customization surface that satisfies TZ §5 "process customization."
- Forms via RHF + Zod; shapes from `packages/validators`.

## Out of scope
- Instantiating a template onto a property (Phase 3).
- Enforcing the blocking rule at runtime (Phase 4 — here we only store it).
- Auto-generating material lists from the template (A2 — deferred).
- Wage *crediting* (Phase 5/7) — here we only store the rate.

## Data model touched
- **Per-tenant**: `templates`, `stages`, `sub_stages` (work units), `checklist_items` (control points), `photo_requirements`, `specializations`.
- `packages/validators`: template, stage, checklist schemas.
- Tenant migration set (from Phase 1) now contains these tables; the fan-out runner applies them to all tenants.

## Key risks & decisions
- **Modeling the stage/sub-stage tree correctly** is the crux. Get the granularity wrong (e.g. treating stages as the assignable unit when sub-stages are) and Phases 3–5 inherit the mistake. The TZ is explicit that sub-stages are the real work units — model them as such.
- **Open decision**: template versioning strategy. Recommendation: copy-on-instantiate (Phase 3 snapshots the template onto the property), so Owners editing templates never disturb live jobs.
- **Linear-now, non-linear-later**: don't over-build the graph engine, but don't hardcode linearity so deeply that SaaS customization needs a rewrite. Order-with-dependencies is enough.
- **Checklist expressiveness**: validate the schema against *every* TZ control point during seeding. Items like the pressure-test (3.2) and oblique-light check (5.3) have notes/criteria — decide if control points carry a description/criteria field (recommend yes).

## Definition of Done
- [ ] The full TZ default template (**8 stages, ~20 sub-stages, ~90+ control points**, all media requirements, durations, specializations) is seeded into every new tenant — **including Sub-stage 1.1 as the first, `INSPECTOR`-typed stage**.
- [ ] Every TZ control point fits the schema, including threshold-bearing ones (pressure test, oblique-light, slopes) via the description/criteria field.
- [ ] Media requirements accept photo and/or video (A6), with photo as the enforced type.
- [ ] Owner can view the complete stage chain and its checklists in the desktop UI.
- [ ] Owner can edit a checklist (add/remove/edit control points), reorder stages, and set duration + wage rate, persisted per-tenant.
- [ ] The schema supports a manual Inspector block/unblock override on stage dependencies (capability stored; Phase 4 wires the control).
- [ ] Two tenants can have divergent templates with no cross-contamination (re-uses the Phase 1 isolation guarantee).
- [ ] The blocking rule is stored as queryable data ready for Phase 4 to enforce.
