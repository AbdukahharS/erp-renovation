# Phase 5 — Accept Automation (BullMQ)

**Depends on:** Phase 4 · **Est:** ~1.5 weeks · **Critical path:** yes

## Goal

The "hidden process" (TZ business-process step 5) fires reliably and asynchronously the instant an Inspector presses Accept: the master's wage is credited to their virtual balance, the property's remaining budget is decremented, the current stage is closed, the next stage is unlocked, and the next-profile master(s) are notified that work is available. By the end, pressing Accept on the Inspector PWA sets off this whole chain without the inspector waiting on it, and the chain is durable — it survives a worker restart and retries on failure.

## Why now

Phase 4 deliberately left Accept's side-effects as a synchronous placeholder. The TZ is explicit (Module 5, business-process step 5) that these must be automatic and reliable, "without human involvement." The stack doc is equally explicit that this belongs in BullMQ, not the request cycle. This phase converts the placeholder into the production mechanism. It depends on Phase 4 emitting the Accept domain event and on Phase 3's frozen wage amounts; it precedes Phase 7 because the dashboard reads the balances this phase writes.

## Scope

### 5.1 BullMQ + Redis worker setup
- `lib/queue.ts`: BullMQ queue/worker setup on Bun + Redis. **Verified (May 2026)**: BullMQ runs its full test suite on Bun in CI and lists Bun as officially supported, so this is sound. Use **IORedis** for the BullMQ connection, **not** Bun's native `Bun.redis` client — and note this isn't a workaround: BullMQ's *own* official Bun-vs-Node benchmark runs on IORedis (it credits ioredis auto-pipelining for the throughput), so IORedis-on-Bun is the maintainer-endorsed configuration. The stack doc's "25–38% faster" figures are accurate per that benchmark (50K jobs: +25% add, +26% bulk, +12% processing, +33% CPU-bound, +38% flow). Caveat from the maintainers themselves: these are synthetic local-machine numbers; in production, Redis network latency dominates and job *processing* converges to near-parity between runtimes — so don't bank on the percentages for a real deployment. For this ERP the queue work is light and I/O-bound, so runtime throughput is a non-issue regardless.
- `lib/redis.ts`: Redis client instance (IORedis, per the above).
- Worker process model: decide whether workers run in-process with the API or as a separate process (recommendation: separate worker entry, same codebase, so a slow job never blocks the API and they scale independently).
- **Watch worker memory** under sustained job load during this phase. Mild positive evidence here: BullMQ's official benchmark found Bun held steady throughput at 100K jobs where Node degraded (attributed to V8 GC pauses), suggesting Bun's JavaScriptCore handles queue memory pressure at least as well as Node — but that's a synthetic test, so still verify against your own workload.
- **Tenant context in jobs**: every job payload must carry its `tenantId` and the worker must set the correct schema `search_path` before touching data (the Phase 1 isolation guarantee extends into the queue — a job running in the wrong tenant schema is the same breach as a leaked request).

### 5.2 The Accept job chain
The Accept event from Phase 4 enqueues a coordinated set of jobs (the stack doc names three job files — mirror them):

- **`stage-accept.job.ts`** — orchestrator: closes the accepted stage definitively, then fans out the rest.
- **`wage-credit.job.ts`** — credits the stage's frozen wage amount (Phase 3, A4) to the master's virtual balance; records a financial transaction; decrements the property's remaining planned budget.
- **`notify-next-master.job.ts`** — unlocks the next stage (`LOCKED → AVAILABLE`) and dispatches notifications to masters of the next required specialization (TZ: "after plastering is accepted, painters receive a notification"). Actual delivery (Web Push to installed PWAs) and the in-app notification record are Phase 8 — here the job creates the notification intent and calls a dispatch interface that Phase 8 fills in.

### 5.3 Reliability
- Idempotency: accepting the same stage twice (double-tap, retry) must not double-credit wages. Key jobs on the stage-instance id + a processed flag.
- Retry policy + dead-letter handling for failed jobs (BullMQ built-ins per stack doc).
- Failure visibility: a failed wage credit must be observable, not silently lost — money correctness is non-negotiable.

### 5.4 Replace the Phase 4 placeholder
- Remove the synchronous placeholder unlock from Phase 4; the unlock now happens via the job chain. Verify the loop still demonstrably advances stage-to-stage, now asynchronously.

## Out of scope
- Notification *delivery* (Web Push to installed PWA) and the in-app notification center — Phase 8. This phase produces notification intents and a dispatch seam.
- The financial dashboard / Plan-vs-Actual visualization (Phase 7 — this phase writes the numbers, Phase 7 displays them).
- Rating recalculation on accept/reject (Phase 6).
- Scheduled/cron jobs (none needed yet).

## Data model touched
- **Per-tenant**: `master_balances` (virtual balance per master), `financial_transactions` (wage credits, budget decrements), `notification_intents` (queued notifications awaiting Phase 8 delivery), job-idempotency markers.
- `packages/validators`: transaction + notification-intent schemas.

## Key risks & decisions
- **Money correctness under retries** is the defining risk. Idempotent wage crediting is mandatory — design it before writing the job. A retried job must be a no-op if the credit already happened.
- **Tenant-scoped jobs**: the worker must resolve and apply tenant schema context exactly as the request resolver does. Share that code path with Phase 1; do not reimplement it loosely.
- **Worker process decision** (in-process vs separate) affects deploy topology — decide now, document in the README's infra notes.
- **Open decision (parked in README)**: fines model. If fines deduct from balance, the transaction schema here should anticipate negative/fine transaction types even if the UI is Phase 7.
- **Ordering guarantees**: wage credit and stage unlock should both occur, but consider whether unlock should wait on successful wage credit or run independently. Recommendation: independent jobs, both idempotent, both retried — unlocking the next stage shouldn't be held hostage by a transient finance failure, and vice versa.

## Definition of Done
- [ ] Pressing Accept enqueues the job chain and returns immediately; the inspector doesn't wait on side-effects.
- [ ] Wage is credited to the master's virtual balance exactly once, even under retry/double-accept.
- [ ] The property's remaining budget decrements by the credited amount, recorded as a transaction.
- [ ] The next stage unlocks (`AVAILABLE`) and a notification intent for the next-profile master is created.
- [ ] Jobs carry tenant context and operate only in the correct tenant schema (isolation test extended to the worker).
- [ ] A killed/restarted worker resumes pending jobs; failed jobs are visible, not lost.
