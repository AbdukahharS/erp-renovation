import { notificationDeliveries, notifications, pushSubscriptions } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import type { PushDeliveryJobData } from "@repo/queue";
import { and, sql as dsql, eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "../db.ts";

let vapidConfigured = false;
function ensureVapid(): boolean {
	if (vapidConfigured) return true;
	const publicKey = process.env.VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	const subject = process.env.VAPID_SUBJECT;
	if (!publicKey || !privateKey || !subject) return false;
	webpush.setVapidDetails(subject, publicKey, privateKey);
	vapidConfigured = true;
	return true;
}

const PRUNE_AFTER_FAILURES = 5;

/**
 * Phase 8 push sender. Sends ONE Web Push to ONE subscription. Records the
 * outcome in `notification_deliveries` and prunes permanently-failed subs.
 *
 * Failure handling:
 *   - 404/410 Gone → subscription dropped on the push service; delete it and
 *     mark this delivery GONE. Never retried.
 *   - 429/5xx → transient; throw to let BullMQ retry with backoff.
 *   - Other 4xx → permanent for this attempt; record FAILED, bump
 *     failureCount; prune the sub if it crosses PRUNE_AFTER_FAILURES.
 *
 * Payload is intentionally small (<4KB) and free of PII/financials per
 * Phase 8 §8.4 risk note — only what the SW needs to render the notification
 * and link the user to the actionable surface.
 */
export async function processPushDelivery(job: { data: PushDeliveryJobData }): Promise<void> {
	const { tenantSchema, notificationId, subscriptionId } = job.data;

	if (!ensureVapid()) {
		console.warn("[push-delivery] VAPID keys not configured; skipping send");
		return;
	}

	const loaded = await withTenant(db, tenantSchema, async (tx) => {
		const [n] = await tx
			.select({
				id: notifications.id,
				title: notifications.title,
				body: notifications.body,
				targetUrl: notifications.targetUrl,
			})
			.from(notifications)
			.where(eq(notifications.id, notificationId))
			.limit(1);
		const [s] = await tx
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.id, subscriptionId))
			.limit(1);
		return n && s ? { n, s } : null;
	});

	if (!loaded) return; // sub or notification was deleted before send

	const payload = JSON.stringify({
		title: loaded.n.title,
		body: loaded.n.body,
		url: loaded.n.targetUrl ?? "/notifications",
		notificationId: loaded.n.id,
	});

	try {
		await webpush.sendNotification(
			{
				endpoint: loaded.s.endpoint,
				keys: { p256dh: loaded.s.p256dh, auth: loaded.s.auth },
			},
			payload,
			{ TTL: 60 * 60 * 24 },
		);

		await withTenant(db, tenantSchema, async (tx) => {
			await tx
				.update(notificationDeliveries)
				.set({
					status: "SENT",
					attemptCount: dsql`${notificationDeliveries.attemptCount} + 1`,
					lastAttemptAt: new Date(),
					lastError: null,
				})
				.where(
					and(
						eq(notificationDeliveries.notificationId, notificationId),
						eq(notificationDeliveries.subscriptionId, subscriptionId),
					),
				);
			await tx
				.update(pushSubscriptions)
				.set({ lastSeenAt: new Date(), failureCount: 0 })
				.where(eq(pushSubscriptions.id, subscriptionId));
		});
	} catch (err: unknown) {
		const statusCode =
			typeof err === "object" && err !== null && "statusCode" in err
				? Number((err as { statusCode: unknown }).statusCode)
				: 0;
		const message = err instanceof Error ? err.message : String(err);

		if (statusCode === 404 || statusCode === 410) {
			// Subscription is gone on the push service. Remove it and mark this
			// delivery GONE so observability shows the lifecycle.
			await withTenant(db, tenantSchema, async (tx) => {
				await tx
					.update(notificationDeliveries)
					.set({
						status: "GONE",
						attemptCount: dsql`${notificationDeliveries.attemptCount} + 1`,
						lastAttemptAt: new Date(),
						lastError: `gone:${statusCode}`,
					})
					.where(
						and(
							eq(notificationDeliveries.notificationId, notificationId),
							eq(notificationDeliveries.subscriptionId, subscriptionId),
						),
					);
				await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
			});
			return; // do NOT throw — no retry for permanently-gone subs
		}

		const transient = statusCode === 0 || statusCode === 429 || statusCode >= 500;
		await withTenant(db, tenantSchema, async (tx) => {
			await tx
				.update(notificationDeliveries)
				.set({
					status: transient ? "PENDING" : "FAILED",
					attemptCount: dsql`${notificationDeliveries.attemptCount} + 1`,
					lastAttemptAt: new Date(),
					lastError: `${statusCode}:${message.slice(0, 500)}`,
				})
				.where(
					and(
						eq(notificationDeliveries.notificationId, notificationId),
						eq(notificationDeliveries.subscriptionId, subscriptionId),
					),
				);
			const [updated] = await tx
				.update(pushSubscriptions)
				.set({ failureCount: dsql`${pushSubscriptions.failureCount} + 1` })
				.where(eq(pushSubscriptions.id, subscriptionId))
				.returning({ failureCount: pushSubscriptions.failureCount });
			if (updated && updated.failureCount >= PRUNE_AFTER_FAILURES) {
				await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscriptionId));
			}
		});

		if (transient) {
			throw err; // BullMQ retries
		}
	}
}
