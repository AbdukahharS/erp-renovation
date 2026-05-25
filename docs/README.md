# ERP Renovation — Delivery Plan

Internal process-management ERP for standardized apartment renovation, built to scale into a B2B SaaS product. This document is the entry point: it captures the locked decisions, the conventions every phase relies on, and the phase index. Read this before any phase file.

---

## 1. What we're building

An assembly-line system that turns apartment renovation into a strictly-sequenced, checklist-gated pipeline. A property moves through ~8 stages; each stage is completed by a **Master**, accepted by an **Inspector** against a digital checklist, and on acceptance the system automatically credits the master's wage, unlocks the next stage, and notifies the next master. The **Owner** sees consolidated unit economics and authors the templates that drive the whole machine.

The differentiator is not any single feature — it's that the *process itself* is the product. The pipeline is inviolable (stage B cannot start until stage A is accepted), the checklists are the quality gate, and the financial truth updates in real time as stages close.

See `ERP_Technical_Specification_Apartment_Renovation.md` for the full functional spec and the stage-by-stage checklists, and `tech-stack-and-monorepo.md` for the committed stack.

---

## 2. Locked decisions

These were decided up front and the entire phase plan is built around them. Changing one of these mid-build is a re-plan, not a tweak.

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| D1 | First milestone goal | **SaaS-ready from day one** | Multi-tenancy and template customization are first-class, not retrofits. |
| D2 | Multi-tenancy model | **Schema-per-tenant from the start** | Higher upfront cost; zero migration pain later. Drives Phase 1 heavily. |
| D3 | Platform priority | **Web desktop (Owner) + PWA (field roles) in parallel** | One React+Vite codebase, role-gated, responsive/PWA from the start. |
| D4 | Team | **Solo fullstack** | Sequencing avoids parallel-track assumptions; scope is cut aggressively where it doesn't serve the critical path. |

---

## 3. Working assumptions (overridable)

These were chosen on the builder's behalf to keep momentum. Each is cheap to revisit; flip any of them and only the noted area changes.

| # | Area | Assumption | Why | If you flip it |
|---|------|------------|-----|----------------|
| A1 | Procurement role | Modeled as a distinct 4th role in the schema now; **UI deferred**. Owner covers procurement manually meanwhile. | Baking the role into the auth enum now is cheap under SaaS; rebuilding the role model later is not. | Build the procurement interface in Phase 6 instead of deferring further. |
| A2 | Auto-estimation | **Deferred.** Owner fixes planned unit cost manually ($/m²). | A materials catalog with per-stage quantity formulas is its own module, off the critical path. | Adds a Materials/Estimation module before Finance can show full Plan-vs-Actual. |
| A3 | Checklist/template engine | **Built data-driven from the start**, seeded with the TZ's default template: **8 stages / ~20 sub-stages / ~90+ control points**. | Schema-per-tenant + customizable pipelines is the core SaaS differentiator; hardcoding then retrofitting means a rewrite. | N/A — not recommended to flip. This is load-bearing. |
| A4 | Wage model | **Per-m² rate per stage** (rate × unit area). Flat-per-stage is the special case. | Matches the unit-economics framing and the $230/m² target. | Simplify the finance schema to flat amounts per stage. |
| A5 | Real-time dashboard | **Deferred.** First release uses TanStack Query refetch-on-nav + invalidate-after-mutation. WebSockets are a later polish phase. | The Accept automation works fine via BullMQ + refetch; WS infra is not critical path for a solo dev. | Pull the WebSocket work from Phase 8 forward into Phase 4. |
| A6 | Photo vs video reports | **Photos required, video optional.** The media-asset model accepts both from the start; only photo is *enforced* as the completion blocker. The TZ says "photo/video" throughout. | Mandatory video would multiply R2 cost and complicate camera capture; making video an allowed-but-optional attachment honors the spec without that cost. | Make video a required report type for specific stages → enforcement logic + R2 cost both grow. |
| A7 | Role naming | The TZ's "Manager" ≡ **Owner**; "Chief Technical Supervisor" ≡ an **Inspector** with a closing permission (not a separate role); "Cleaning Company" (Stage 8.1) is a **contractor task assigned like any Master stage** but flagged as external. The enum stays `OWNER/INSPECTOR/MASTER/PROCUREMENT`. | The TZ's extra titles are responsibilities, not new identities; modeling them as permissions/flags avoids enum sprawl. | Promote any of these to a distinct role → touches Phase 1 auth + every guard. |

---

## 4. The four interfaces

The role model (TZ §2) plus A1 gives four roles, each a distinct surface gated by the same auth layer:

- **Owner / Manager** — desktop web. Consolidated analytics, unit economics, template & rate authoring, property creation.
- **Inspector (Technical Supervision)** — PWA. Acceptance queue, digital checklists, accept/reject with photo+comment, fines.
- **Master (Executor)** — PWA. Only their current task: take-into-work, photo upload, request acceptance. Everything else hidden.
- **Procurement** *(role exists, UI deferred — A1)* — eventual material-list interface.

---

## 5. Tech stack (committed)

Per `tech-stack-and-monorepo.md`. Quick reference:

- **Runtime/PM/test**: Bun · **Backend**: Elysia · **API types**: Eden Treaty · **ORM**: Drizzle · **DB**: PostgreSQL (schema-per-tenant)
- **Queue**: BullMQ + Redis · **Frontend**: React + Vite (PWA) · **Routing**: TanStack Router · **Server state**: TanStack Query
- **Forms/validation**: React Hook Form + Zod (`packages/validators` shared) · **UI**: shadcn/ui + Tailwind
- **Monorepo**: Turborepo over Bun workspaces · **Storage**: Cloudflare R2 via presigned URLs · **Notifications**: Web Push (installed PWA) + in-app notification center · **Auth**: Better Auth · **Infra**: Docker Compose (local) → Railway

---

## 6. Conventions every phase follows

**Definition of Done for any phase**: the feature works end-to-end through a real Elysia endpoint with Zod-validated input, is consumed by the frontend via the Eden Treaty client, has tenant isolation verified, and the happy path is exercised by at least one Bun test. No phase is "done" with a stubbed backend.

**Multi-tenancy rule**: every data-touching code path resolves a tenant context first and operates inside that tenant's schema. There is no query that doesn't know its tenant. This is checked in Phase 1 and never relaxed.

**Validation rule**: a data shape is defined once as a Zod schema in `packages/validators`, consumed by both Elysia (route input) and RHF (form fields). If frontend and backend disagree on a shape, that's a bug in the shared schema, not two bugs. **Source-of-truth precedence**: where an Eden-Treaty-inferred type (derived from the Elysia route) and a `validators` Zod schema describe the same payload, the **Zod schema in `packages/validators` is authoritative for runtime validation**, and the Elysia route must validate against it — so the inferred type Eden hands the frontend is *derived from* the Zod schema, not a parallel definition. Eden gives compile-time types for free; Zod owns runtime truth. They cannot drift if the route validates with the shared schema.

**Schema-as-source-of-truth**: Drizzle schema in `packages/db` is the canonical data model. Migrations via `drizzle-kit`. The frontend never imports Drizzle — all access goes through Elysia.

**Vertical slices**: phases deliver working role-to-database slices, not horizontal layers. We do not build "all the schema," then "all the API," then "all the UI." Each phase picks a capability and takes it all the way down.

---

## 7. Phase index

Each phase is a separate file. They are ordered by dependency — later phases assume earlier ones are done. Rough effort is in solo-dev weeks and is indicative, not a commitment.

| Phase | File | Theme | Depends on | Est. |
|-------|------|-------|-----------|------|
| 0 | `PHASE-0-foundation.md` | Monorepo, tooling, CI, Docker, deploy skeleton | — | ~1 wk |
| 1 | `PHASE-1-tenancy-auth.md` | Schema-per-tenant, Better Auth, 4-role model, route guards | 0 | ~2 wk |
| 2 | `PHASE-2-templates-pipeline.md` | Template/checklist engine, stage sequencing, blocking logic | 1 | ~2–3 wk |
| 3 | `PHASE-3-properties.md` | Property cards, template instantiation, scheduling | 2 | ~1.5 wk |
| 4 | `PHASE-4-acceptance-flow.md` | The core loop: complete → checklist → accept/reject + R2 photos | 3 | ~2.5 wk |
| 5 | `PHASE-5-automation-jobs.md` | BullMQ Accept automation: wage credit, unlock, notify | 4 | ~1.5 wk |
| 6 | `PHASE-6-hr-masters.md` | Master profiles, ratings, availability, invite links | 4 | ~1.5 wk |
| 7 | `PHASE-7-finance.md` | Wages, virtual balances, Plan-vs-Actual dashboard, unit closing | 5 | ~2 wk |
| 8 | `PHASE-8-realtime-notifications.md` | Web Push (installed PWA), in-app notification center, WebSocket live dashboard | 5 | ~2 wk |
| 9 | `PHASE-9-hardening-saas.md` | Tenant provisioning, billing-readiness, perf, security, launch | all | ~2 wk |

**Critical path to a usable internal pilot**: Phases 0 → 1 → 2 → 3 → 4 → 5 → 7. That sequence gets one tenant running the full pipeline with working money. Phases 6, 8, and 9 harden and complete the SaaS story.

---

## 8. How to read a phase file

Every phase file uses the same structure:

1. **Goal** — one paragraph: what's true at the end that wasn't true at the start.
2. **Why now** — the dependency and sequencing rationale.
3. **Scope** — in-scope stages, each broken into concrete tasks.
4. **Out of scope** — explicitly what this phase does *not* do, to prevent creep.
5. **Data model touched** — Drizzle tables / validator schemas added or changed.
6. **Key risks & decisions** — what could go wrong, what's still open.
7. **Definition of Done** — the checklist that closes the phase.

---

## 9. Open questions still parked

Not blocking, but will need answers by the phase noted:

- **Fines model** (TZ §2 Inspector "apply fines for defects") — flat fine? deduction from balance? Needed by Phase 7.
- ~~**Telegram vs PWA push priority for field roles**~~ — **Resolved (2026-05-25).** The TZ says "PWA *or* Telegram bot" (alternatives, not both) and uses Telegram only as an *example* of a notification channel ("например, в Telegram"); the inspector notification is specified as "пуш-уведомление" outright. We commit to **installed PWA + Web Push** as the sole channel, with an **in-app notification center** (unread badge, history, read/unread state) inside the PWA so dismissed pushes are recoverable. Telegram is dropped from scope; if a future tenant has an iOS-heavy fleet where Web Push reliability becomes a real problem, Telegram can be reintroduced as an optional second channel against the dispatch seam Phase 5 already provides.
- **"Before" photo storage retention** — how long do we keep construction-site photos? Cost driver on R2. Needed by Phase 9.
- **Multi-level screed / multi-currency** — the spec uses $; SaaS clients may not. Currency-per-tenant? Needed by Phase 9.

### Verification flags (claims to confirm, not assume)

- **BullMQ-on-Bun** — *Verified May 2026, incl. benchmarks.* BullMQ runs its full test suite on Bun in CI and lists Bun as officially supported. The stack doc's "25–38% faster" figures match BullMQ's own published Bun-vs-Node benchmark. **Phase 5 note**: use **IORedis** (not `Bun.redis`) for the BullMQ connection — this is the maintainer-endorsed config their own benchmark runs on, not a workaround. Caveat: the figures are synthetic/local; in production, job processing converges to near-parity as Redis network latency dominates. Irrelevant for this ERP's light queue load either way.
- **Bun memory** — the stack doc claims earlier memory issues are resolved. Bun is at a mature stable release in 2026, and BullMQ's benchmark showed Bun handling queue memory pressure better than Node at scale. Treat as broadly fine; still watch worker memory under your real workload in Phase 5.

---

## 10. Audit resolution log

An external audit against the two source documents surfaced ten findings; all are resolved in the current files.

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Stage/item undercount ("8 stages, ~40 items") | Corrected everywhere to **8 stages / ~20 sub-stages / ~90+ control points** (README A3, Phase 2 goal/scope/DoD). |
| 2 + 3 | Sub-stage 1.1 "before-photo" gate and "Ready for Production" status unowned; Phase 3 wrongly unlocked the first master stage at creation | **Most important fix.** 1.1 is now the template's first (`INSPECTOR`-typed) stage (Phase 2), instantiated but gating in Phase 3 §3.5, and executed through the Phase 4 loop. Property state machine now `PENDING → READY_FOR_PRODUCTION → IN_PROGRESS → COMPLETED → ARCHIVED`. First master stage unlocks only on 1.1 acceptance. |
| 4 | Video silently dropped to photos-only | New assumption **A6**: media model accepts photo+video from the start; photo enforced, video optional. Threaded through Phases 2 and 4. |
| 5 | Inspector manual block/unblock right unimplemented | Capability modeled in Phase 2 §2.3; control + server enforcement + audit added to Phase 4 §4.6 and DoD. |
| 6 | Role-name mismatches (Manager, Chief Inspector, Cleaning Company) | New assumption **A7**: Manager≡Owner, Chief Inspector≡Inspector permission, cleaning≡external-contractor Master flag. Applied in Phase 7 §7.4. |
| 7 | "15 steps" vs "8 stages" TZ inconsistency | Canonical-source note added to Phase 2 §2.1: detailed checklist section is canonical. |
| 8 | BullMQ-on-Bun claims asserted as settled | Web-verified (see §9 verification flags); IORedis caveat added to Phase 5 §5.1; unconfirmed benchmark figure softened. |
| 9 | Eden Treaty vs Zod source-of-truth tension | Precedence rule added to §6: Zod in `packages/validators` is authoritative for runtime; the Elysia route validates against it so Eden's inferred type derives from it. |
| 10 | TZ's "PWA *or* Telegram" quietly upgraded to "and" | **Re-resolved (2026-05-25)**: reverted to PWA-only. The TZ frames the two as alternatives and uses Telegram only as an illustrative example; the inspector notification is literally specified as "push." We ship installed PWA + Web Push + an in-app notification center, and drop Telegram from scope. See §9. |
