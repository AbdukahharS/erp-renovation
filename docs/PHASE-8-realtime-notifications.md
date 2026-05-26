# Phase 8 — Notifications & Real-Time

**Depends on:** Phase 5 (fills the notification-dispatch seam it created) · **Est:** ~2 weeks · **Critical path:** no

## Goal

The notification intents that Phase 5 produces actually reach people, and the dashboards go live. Masters and Inspectors receive instant **Web Push notifications** to their **installed PWA** for the events that matter ("You've been assigned a task at Property #5", "The electrical stage was not accepted, please fix the issues"), and an **in-app notification center** inside the PWA lets them see unread counts and revisit history when a push is dismissed or missed. The Owner's dashboard updates in real time as stages close, without a manual refresh. By the end, the system is genuinely responsive — the on-site field roles get pushed to and have a recoverable inbox, and the office role watches money and progress move live.

## Why now

Per A5, real-time was deliberately deferred so the solo build wasn't blocked on WebSocket infra while the core loop was unproven. Phase 5 created a clean dispatch seam and notification intents specifically so this phase could fill them in without touching the automation logic. It depends on Phase 5's intents and on the PWA shell from Phase 0/1 being installable. It's off the critical path — the system is *usable* without it (refetch-on-nav works) but not *delightful* or truly field-ready.

**Channel decision (locked, 2026-05-25)**: The TZ frames mobile as "PWA *or* Telegram bot" — alternatives, not both — and uses Telegram only as an example ("например, в Telegram"); the inspector notification is specified as "пуш-уведомление" outright. We ship **installed PWA + Web Push as the sole external channel**, backed by an **in-app notification center** so dismissed pushes are never permanently lost. Telegram (grammy) is **dropped from scope**. Onboarding requires field workers to install the PWA to their home screen and grant notification permission; this is non-negotiable and is enforced by the Master/Inspector first-run flow. If a future tenant has an iOS-heavy fleet and Web Push reliability becomes a real problem, Telegram can be reintroduced against the same dispatch seam without re-architecting.

## Scope

### 8.1 Web Push delivery
- Web Push wired through the Phase 0 service worker baseline: VAPID keys, subscription endpoint, push payload encryption.
- The dispatch seam from Phase 5 delivers notification intents as Web Push messages: task-available, stage-rejected, task-assigned, stage-ready-for-acceptance, stage-blocked/unblocked.
- Subscriptions stored per device (a user can have the PWA installed on phone + tablet); a failed/expired subscription is pruned and the user is re-prompted on next session.
- Delivery runs as a BullMQ job (reuse Phase 5 infra) so transient push-service failures retry. A dropped "task available" notification means a stalled property — the in-app center (§8.2) is the safety net.

### 8.2 In-app notification center (PWA UI)
- A notification bell/inbox in the PWA shell for every role, showing unread count badge, list of recent notifications (newest first), and per-item read state.
- Every dispatched notification intent (Phase 5) is also persisted as an **in-app notification record** at fan-out time, *regardless* of whether Web Push delivery succeeded. Push and in-app are two views of the same intent — the push is the interrupt, the inbox is the record. A missed push is recoverable; a closed notification is recoverable.
- Each item links to the relevant property/stage so tapping it lands the user on the actionable surface.
- Read/unread state syncs across devices for the same user. Marking read in the inbox clears the badge; opening the linked target auto-marks read.
- Retention: keep notifications for ~90 days then auto-archive (configurable per-tenant in Phase 9). Read items below a "Recent" cutoff collapse into a "History" section.

### 8.3 PWA install + permission onboarding
- Master/Inspector first-run flow requires installing the PWA (Add to Home Screen prompt on Android; guided iOS install instructions on iOS 16.4+) and granting notification permission. A user who declines either is reminded on each subsequent session — they can use the app but acknowledge they won't get pushes; the in-app inbox still works.
- Owner/desktop users get the same Web Push prompt but installation is optional.
- Delivery tracking: mark intents delivered/failed per device; failures retry via BullMQ; permanently failed devices are pruned.

### 8.4 WebSocket live dashboard
- Elysia WebSocket endpoint (stack doc: "WebSocket events from Elysia trigger targeted query invalidations").
- On stage acceptance / financial change, push an event that triggers a **targeted TanStack Query invalidation** on connected clients — the Owner's Plan-vs-Actual and the property board update without a refresh.
- Tenant-scoped subscriptions: a client only receives events for its own tenant (extend the Phase 1 isolation guarantee to the socket layer).
- This *replaces* the refetch-on-nav stopgap (A5) for the dashboard; refetch remains a fallback when the socket is down.

## Out of scope
- SMS / email channels (not in TZ; Web Push + in-app inbox cover it).
- Telegram bot (dropped from scope per the channel decision above; dispatch seam remains so it can be added later without rework).
- Real-time collaborative editing of templates (not needed — templates are single-author).
- Push for the Procurement role (A1 — role UI still deferred).

## Data model touched
- **Per-tenant**: `notifications` (in-app records: recipient, type, payload, target link, created/read timestamps), `push_subscriptions` (per-device VAPID subscriptions on user), `notification_deliveries` (per-device delivery attempts + status for retry/audit).
- `packages/validators`: notification, push-subscription, delivery schemas.

## Key risks & decisions
- **iOS Web Push reliability**: requires home-screen install on iOS 16.4+, and Apple's APNs throttling is real. The in-app notification center is the load-bearing mitigation — a missed push is annoying, a lost task assignment is a stalled property. Test the iOS install + permission flow on a real device before declaring done.
- **PWA install enforcement**: we can't *force* install, only nudge. The first-run flow must make the cost of declining clear ("you won't be notified when work is ready") and the inbox must be discoverable enough that a no-push user can still operate.
- **Push payload size + privacy**: Web Push payloads are limited (~4KB) and visible in OS notification UI. Keep payloads to "what + where" with a deep link; full details fetched on tap. Don't put financial figures or personal data in payloads.
- **WebSocket + schema-per-tenant**: socket subscriptions must be tenant-scoped at connection auth time; never broadcast cross-tenant. Reuse the request resolver's tenant logic at the socket handshake.
- **Delivery reliability**: push delivery runs as BullMQ jobs (reuse Phase 5 infra) so transient push-service failures retry. The in-app record is written *before* push dispatch so the inbox is correct even if push never lands.
- **WebSocket scaling**: a single API instance is fine for pilot; if the API scales horizontally later, sockets need a Redis pub/sub fan-out (Redis is already present). Note this for Phase 9.
- **Notification retention**: 90 days default; revisit when the photo-retention question (Phase 9) is settled, since both are R2/DB cost drivers.

## Definition of Done
- [ ] A master, after installing the PWA and granting permission, receives a Web Push when a stage becomes available to their specialization — and the same notification appears in their in-app inbox with unread state.
- [ ] An inspector receives a push + inbox entry when a stage is submitted for acceptance; a master receives one when their stage is rejected.
- [ ] The in-app notification center shows an unread badge, lists recent + archived notifications, supports tap-through to the linked target, syncs read state across the same user's devices, and persists every dispatched intent regardless of push-delivery outcome.
- [ ] First-run onboarding for Master/Inspector roles prompts PWA install + push permission, with a clear fallback path for users who decline.
- [ ] Push delivery failures retry via BullMQ; expired subscriptions are pruned; permanently failed devices don't block the inbox.
- [ ] The Owner's dashboard updates live on stage acceptance via WebSocket-triggered query invalidation, scoped to their tenant.
- [ ] Socket subscriptions cannot receive another tenant's events (isolation test extended to the socket layer).
