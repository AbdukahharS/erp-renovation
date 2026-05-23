# Phase 8 — Notifications & Real-Time

**Depends on:** Phase 5 (fills the notification-dispatch seam it created) · **Est:** ~2 weeks · **Critical path:** no

## Goal

The notification intents that Phase 5 produces actually reach people, and the dashboards go live. Masters and Inspectors receive instant Telegram messages and/or Web Push for the events that matter ("You've been assigned a task at Property #5", "The electrical stage was not accepted, please fix the issues"). The Owner's dashboard updates in real time as stages close, without a manual refresh. By the end, the system is genuinely responsive — the on-site field roles get pushed to, and the office role watches money and progress move live.

## Why now

Per A5, real-time was deliberately deferred so the solo build wasn't blocked on WebSocket infra while the core loop was unproven. Phase 5 created a clean dispatch seam and notification intents specifically so this phase could fill them in without touching the automation logic. It depends on Phase 5's intents and on Phase 6's master contact details (Telegram handles). It's off the critical path — the system is *usable* without it (refetch-on-nav works) but not *delightful* or truly field-ready.

## Scope

### 8.1 Telegram bot (grammy)
- `grammy` bot (Bun-compatible per stack doc) in the notifications module.
- Master/Inspector links their Telegram account to their system identity (via the invite flow from Phase 6 or a link-code in-app).
- The dispatch seam from Phase 5 now delivers notification intents as Telegram messages: task-available, stage-rejected, task-assigned, stage-ready-for-acceptance.
- Justification per TZ §4: Telegram is right for on-site workers — no app install, reliable, works on any phone.

### 8.2 Web Push
- Web Push for the browser/desktop side (Inspectors/Owner who are at a machine).
- Service worker (baseline from Phase 0) now handles push subscriptions and displays notifications.
- Same dispatch seam — a notification intent fans out to whichever channels the recipient has enabled.

### 8.3 Channel routing & preferences
- Per-user channel preferences: Telegram, Web Push, or both. A master on-site wants Telegram; an Owner at a desk wants Push.
- Delivery tracking: mark intents delivered/failed; retry via the existing BullMQ infra (notifications are jobs too).

### 8.4 WebSocket live dashboard
- Elysia WebSocket endpoint (stack doc: "WebSocket events from Elysia trigger targeted query invalidations").
- On stage acceptance / financial change, push an event that triggers a **targeted TanStack Query invalidation** on connected clients — the Owner's Plan-vs-Actual and the property board update without a refresh.
- Tenant-scoped subscriptions: a client only receives events for its own tenant (extend the Phase 1 isolation guarantee to the socket layer).
- This *replaces* the refetch-on-nav stopgap (A5) for the dashboard; refetch remains a fallback when the socket is down.

## Out of scope
- SMS / email channels (not in TZ; Telegram + Push cover it).
- In-app notification center / history UI (could be a small addition; not required — decide if cheap).
- Real-time collaborative editing of templates (not needed — templates are single-author).
- Push for the Procurement role (A1 — role UI still deferred).

## Data model touched
- **Per-tenant**: `notification_deliveries` (per-channel delivery records), `channel_preferences`, Telegram-account links on masters/users, Web Push subscriptions.
- **Control plane**: possibly the Telegram chat-id mapping if users span tenants — decide consistent with the Phase 1 user-location decision.
- `packages/validators`: notification-channel, subscription schemas.

## Key risks & decisions
- **Telegram account linking** is the friction point — getting a master's Telegram chat id reliably tied to their identity. Use a deep-link start code from the invite flow (Phase 6) so linking is one tap.
- **WebSocket + schema-per-tenant**: socket subscriptions must be tenant-scoped at connection auth time; never broadcast cross-tenant. Reuse the request resolver's tenant logic at the socket handshake.
- **Delivery reliability**: notifications run as BullMQ jobs (reuse Phase 5 infra) so a transient Telegram/Push failure retries. A dropped "task available" notification means a stalled property.
- **WebSocket scaling on Railway**: a single API instance is fine for pilot; if the API scales horizontally later, sockets need a Redis pub/sub fan-out (Redis is already present). Note this for Phase 9.
- **Open decision (parked in README)**: if time-boxed, Telegram vs Push priority. Recommendation: Telegram first (field roles are the TZ's explicit priority), Push second.

## Definition of Done
- [ ] A master links Telegram in one tap and receives a real message when a stage becomes available to their specialization.
- [ ] An inspector receives a notification when a stage is submitted for acceptance; a master receives one when their stage is rejected.
- [ ] Users can choose channels (Telegram / Push / both); delivery is tracked and failures retry via BullMQ.
- [ ] The Owner's dashboard updates live on stage acceptance via WebSocket-triggered query invalidation, scoped to their tenant.
- [ ] Socket subscriptions cannot receive another tenant's events (isolation test extended to the socket layer).
