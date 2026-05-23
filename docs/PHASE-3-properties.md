# Phase 3 — Properties (Units)

**Depends on:** Phase 2 · **Est:** ~1.5 weeks · **Critical path:** yes

## Goal

The Owner can create a property and have the system instantiate the tenant's default template onto it — producing a concrete, ordered set of stage instances with the first stage unlocked and everything after it blocked. By the end, a property exists as a living pipeline: a board of stages with statuses (locked / available / in-progress / submitted / accepted), a fixed planned unit cost, and a generated schedule. This is where the abstract template (Phase 2) becomes a real job.

## Why now

A property is the noun the entire acceptance loop (Phase 4) operates on. You can't accept a stage that doesn't exist on a property. Properties depend on templates existing (Phase 2) to instantiate from. This phase deliberately precedes the acceptance loop so that Phase 4 has a real pipeline to drive.

## Scope

### 3.1 Property card & creation
- Property entity: address, layout type (new-build / secondary), minimalist floor-plan upload, status (`PENDING` / `READY_FOR_PRODUCTION` / `IN_PROGRESS` / `COMPLETED`; `ARCHIVED` terminal in Phase 7 — see §3.5 for the full state machine), deadlines, and the fixed **planned unit cost** (A2: entered manually by Owner — e.g. $230/m² × area).
- Square meterage captured here (drives A4 wage math downstream).
- Floor-plan image upload via R2 presigned URL (reuses the storage pattern that Phase 4 leans on heavily — establish it here on a low-stakes upload).
- Owner desktop creation flow: multi-step form (RHF + Zod), since unit creation has several fields per the stack doc's "multi-step forms for unit creation" note.

### 3.2 Template instantiation (the snapshot)
- On creation, **snapshot** the tenant's default template onto the property (per Phase 2's copy-on-instantiate decision): create stage-instances and sub-stage-instances with their checklists copied in, so later template edits don't disturb this property.
- **The first instantiated stage is Sub-stage 1.1 (Initial Property Acceptance), an Inspector-performed stage** — NOT a master stage. On creation the property is `PENDING`; instantiation does **not** unlock any *master* work. Only Sub-stage 1.1 is `AVAILABLE` (to the Inspector); all master stages are `LOCKED`. This corrects the earlier draft, which wrongly unlocked the first master stage on creation — the TZ gates master work behind the 1.1 "before-photo" acceptance (see §3.5).
- Each stage-instance carries its computed wage amount (rate × area, A4) frozen at instantiation. (Sub-stage 1.1, being Inspector-performed, carries no master wage.)

### 3.5 Property state machine & the "Ready for Production" gate
This subsection exists specifically to close the workflow gap the TZ defines in business-process step 2 ("Zero Stage") and Sub-stage 1.1.

- **Property status enum** (corrected): `PENDING → READY_FOR_PRODUCTION → IN_PROGRESS → COMPLETED`, with `ARCHIVED` as the terminal Phase-7 state. The earlier draft's three-state enum (`PENDING/IN_PROGRESS/COMPLETED`) was missing `READY_FOR_PRODUCTION`, which the TZ names explicitly.
- **The gate**: a property sits at `PENDING` until the Inspector completes **Sub-stage 1.1 (Initial Property Acceptance)** — uploading the mandatory "before" photos (meter readings, panoramic room shots, door/window condition, riser condition per TZ 1.1) and passing the 1.1 control-point checklist (7 Yes/No items). This runs through the *same* acceptance mechanism as every other stage (Phase 4), just performed by the Inspector rather than a Master.
- On 1.1 acceptance, the property transitions `PENDING → READY_FOR_PRODUCTION`, and **only then** does the first *master* stage unlock (`LOCKED → AVAILABLE`). The property moves to `IN_PROGRESS` when the first master takes a stage into work.
- **Ownership note**: Sub-stage 1.1 is modeled as the template's first stage (Phase 2 seeds it), instantiated here in Phase 3, and *executed* through the Phase 4 acceptance loop. No new mechanism is needed — but the gate logic (1.1-accepted ⇒ Ready-for-Production ⇒ first master stage unlocks) is owned **here**, and Phase 4 must respect it.
- **Materials verification** (TZ step 2): the TZ also has the Inspector "verify availability of materials" at this gate. With procurement deferred (A1/A2), model this as a simple manual checkbox on the 1.1 acceptance ("materials on site: yes/no") rather than a materials-catalog check — enough to honor the gate without building the deferred module.

### 3.6 Schedule generation
- From each stage's standard duration (Phase 2), generate a schedule — a stage timeline (the TZ mentions Gantt or Kanban; D4 solo-scope → start with a **Kanban-style stage board**, defer Gantt).
- The board is the Owner's at-a-glance view of where the property is in the pipeline.

### 3.7 Property list & detail views
- Owner: list of all tenant properties with status (including `READY_FOR_PRODUCTION`) + at-a-glance progress; detail view showing the stage board.
- Status rollup: property status derives from its stages (1.1 accepted → ready-for-production; first master stage taken → in-progress; all stages accepted → completed-eligible).

## Out of scope
- Assigning masters to stages / taking into work (Phase 4).
- The completion → checklist → accept loop (Phase 4).
- Auto-generated material lists / procurement (A2 deferred).
- Wage *crediting* on accept (Phase 5) — amounts are frozen here but not yet paid.
- Gantt visualization (deferred; Kanban board only).
- Final financial closing (Phase 7).

## Data model touched
- **Per-tenant**: `properties` (with the corrected status enum incl. `READY_FOR_PRODUCTION`), `stage_instances`, `sub_stage_instances`, `checklist_item_instances` (snapshotted from template), property floor-plan asset reference, and the "before" photo assets + materials-on-site flag captured at Sub-stage 1.1.
- `packages/validators`: property + instantiation schemas.

## Key risks & decisions
- **The snapshot is the critical mechanic.** Instantiation must deep-copy the template tree (stages → sub-stages → checklist items → photo requirements) into instance tables. Get this right and template editing is safe forever; get it wrong and editing a template corrupts live jobs.
- **The Ready-for-Production gate is a correctness fix, not a nicety.** The first master stage must NOT be reachable until Sub-stage 1.1 is accepted. This is enforced as the same blocking invariant as any other stage dependency (Phase 4 owns enforcement) — 1.1 is simply the predecessor of the first master stage. Treating creation-time as the unlock point (the earlier draft's error) would let masters start on an undocumented property, defeating the TZ's whole "protect the fixed budget from hidden defects" rationale for 1.1.
- **Frozen wage amounts**: computing wage at instantiation (rate × area) and freezing it means a later rate change doesn't retroactively alter a property's economics — correct behavior, but confirm it matches business intent.
- **R2 presigned upload pattern** is first used at scale in Phase 4; proving it here on floor plans (and the 1.1 "before" photos) de-risks Phase 4.
- **Status state machine**: define the stage-instance status enum cleanly now (`LOCKED → AVAILABLE → IN_PROGRESS → SUBMITTED → ACCEPTED`, plus `REJECTED` looping back to `IN_PROGRESS`). Note Sub-stage 1.1 uses this same enum but is Inspector-performed. Phase 4 transitions through it; getting the states right here prevents churn.

## Definition of Done
- [ ] Owner creates a property with address, floor plan, area, and fixed planned unit cost; property starts at `PENDING`.
- [ ] On creation, the default template is snapshotted into concrete stage/sub-stage/checklist instances on that property.
- [ ] **No master stage is unlocked at creation.** Only Sub-stage 1.1 (Inspector) is available; all master stages are locked.
- [ ] On 1.1 acceptance, the property moves to `READY_FOR_PRODUCTION` and the first master stage unlocks; the materials-on-site flag is captured at 1.1.
- [ ] Each master stage-instance has its frozen wage amount (rate × area).
- [ ] A schedule/Kanban board renders the property's stage pipeline, showing the `READY_FOR_PRODUCTION` state distinctly.
- [ ] Editing the tenant template afterward does **not** change this property's snapshotted pipeline.
