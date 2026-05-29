import {
	notificationDeliveries,
	notificationIntents,
	notifications,
	properties,
	pushSubscriptions,
	stageInstances,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import {
	DEFAULT_JOB_OPTS,
	getPushDeliveryQueue,
	type NotificationDispatchJobData,
	publishToTenant,
} from "@repo/queue";
import { eq } from "drizzle-orm";
import { db } from "../db.ts";

/**
 * Phase 8 dispatcher. Consumes one `notification_intents` row and:
 *   1. Inserts a paired `notifications` row (idempotent via UNIQUE on intent_id — Postgres treats multiple NULLs as distinct, so intent-less notifications still coexist).
 *   2. Sets `notification_intents.notificationId` + status='SENT'.
 *   3. Fans out one PUSH_DELIVERY job per active push subscription for the recipient.
 *   4. Broadcasts a NOTIFICATION_CREATED realtime event to the tenant.
 *
 * Permanent push-delivery failure does NOT block the in-app record — the
 * notification row is the recoverable safety net per Phase 8 spec §8.2.
 */
export async function processNotificationDispatch(job: {
	data: NotificationDispatchJobData;
}): Promise<{ notificationId: string | null; pushJobsEnqueued: number }> {
	const { tenantSchema, notificationIntentId } = job.data;

	const result = await withTenant(db, tenantSchema, async (tx) => {
		const [intent] = await tx
			.select()
			.from(notificationIntents)
			.where(eq(notificationIntents.id, notificationIntentId))
			.limit(1);
		if (!intent) return null;

		const { title, body, targetUrl } = await buildContent(
			// biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction
			tx as any,
			intent.type,
			intent.subStageInstanceId,
			intent.propertyId,
			(intent.payload as Record<string, unknown> | null) ?? null,
		);

		const [inserted] = await tx
			.insert(notifications)
			.values({
				recipientUserId: intent.targetUserId,
				type: intent.type,
				title,
				body,
				targetUrl,
				propertyId: intent.propertyId,
				subStageInstanceId: intent.subStageInstanceId,
				intentId: intent.id,
			})
			.onConflictDoNothing({ target: notifications.intentId })
			.returning({ id: notifications.id });

		let notificationId = inserted?.id ?? null;
		if (!notificationId) {
			const [existing] = await tx
				.select({ id: notifications.id })
				.from(notifications)
				.where(eq(notifications.intentId, intent.id))
				.limit(1);
			notificationId = existing?.id ?? null;
		}

		if (notificationId && intent.status !== "SENT") {
			await tx
				.update(notificationIntents)
				.set({
					status: "SENT",
					notificationId,
					sentAt: new Date(),
				})
				.where(eq(notificationIntents.id, intent.id));
		}

		if (!notificationId) return null;

		const subs = await tx
			.select({ id: pushSubscriptions.id })
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, intent.targetUserId));

		// Pre-create PENDING delivery rows so retries / observability work the
		// same way whether the BullMQ job ran yet or not. Unique constraint
		// absorbs re-dispatch.
		for (const s of subs) {
			await tx
				.insert(notificationDeliveries)
				.values({ notificationId, subscriptionId: s.id })
				.onConflictDoNothing({
					target: [notificationDeliveries.notificationId, notificationDeliveries.subscriptionId],
				});
		}

		return {
			notificationId,
			subscriptionIds: subs.map((s) => s.id),
			recipientUserId: intent.targetUserId,
		};
	});

	if (!result) return { notificationId: null, pushJobsEnqueued: 0 };

	// Broadcast realtime AFTER the tx commits.
	publishToTenant(tenantSchema, {
		kind: "NOTIFICATION_CREATED",
		notificationId: result.notificationId,
		recipientUserId: result.recipientUserId,
	});

	let pushJobsEnqueued = 0;
	if (process.env.REDIS_URL && result.subscriptionIds.length > 0) {
		for (const subscriptionId of result.subscriptionIds) {
			await getPushDeliveryQueue().add(
				"push-delivery",
				{
					tenantSchema,
					notificationId: result.notificationId,
					subscriptionId,
				},
				{
					...DEFAULT_JOB_OPTS,
					attempts: 4,
					jobId: `push-${result.notificationId}-${subscriptionId}`,
				},
			);
			pushJobsEnqueued++;
		}
	}

	return { notificationId: result.notificationId, pushJobsEnqueued };
}

async function buildContent(
	// biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction
	tx: any,
	type: string,
	subStageInstanceId: string | null,
	propertyId: string | null,
	payload: Record<string, unknown> | null,
): Promise<{ title: string; body: string; targetUrl: string | null }> {
	let propertyName = "a property";
	let subStageName = "a stage";

	if (propertyId) {
		const [p] = await tx
			.select({ name: properties.name })
			.from(properties)
			.where(eq(properties.id, propertyId))
			.limit(1);
		if (p) propertyName = p.name;
	}
	let performerType: string | null = null;
	if (subStageInstanceId) {
		const [ss] = await tx
			.select({
				name: subStageInstances.name,
				stageInstanceId: subStageInstances.stageInstanceId,
				performerType: subStageInstances.performerType,
			})
			.from(subStageInstances)
			.where(eq(subStageInstances.id, subStageInstanceId))
			.limit(1);
		if (ss) {
			subStageName = ss.name;
			performerType = ss.performerType;
			if (!propertyId && ss.stageInstanceId) {
				const [si] = await tx
					.select({ propertyId: stageInstances.propertyId })
					.from(stageInstances)
					.where(eq(stageInstances.id, ss.stageInstanceId))
					.limit(1);
				if (si) propertyId = si.propertyId;
			}
		}
	}

	const specialization =
		payload && typeof payload.specialization === "string" ? payload.specialization : null;

	switch (type) {
		case "STAGE_AVAILABLE": {
			const spec = specialization ? ` (${specialization})` : "";
			const isInspector = performerType === "INSPECTOR";
			const body = isInspector
				? `${subStageName} on ${propertyName} is ready for initial acceptance.`
				: `${subStageName} on ${propertyName} is ready to start${spec}.`;
			const targetUrl = subStageInstanceId
				? isInspector
					? `/inspector/stages/${subStageInstanceId}`
					: `/master/stages/${subStageInstanceId}`
				: null;
			return { title: "New stage available", body, targetUrl };
		}
		case "STAGE_SUBMITTED":
			return {
				title: "Stage awaiting acceptance",
				body: `${subStageName} on ${propertyName} was submitted for your review.`,
				targetUrl: subStageInstanceId ? `/inspector/queue/${subStageInstanceId}` : null,
			};
		case "STAGE_REJECTED":
			return {
				title: "Stage rejected",
				body: `${subStageName} on ${propertyName} was rejected. Please fix the issues.`,
				targetUrl: subStageInstanceId ? `/master/stages/${subStageInstanceId}` : null,
			};
		case "STAGE_BLOCKED":
			return {
				title: "Stage blocked",
				body: `${subStageName} on ${propertyName} was blocked by the inspector.`,
				targetUrl: subStageInstanceId ? `/master/stages/${subStageInstanceId}` : null,
			};
		case "STAGE_UNBLOCKED":
			return {
				title: "Stage unblocked",
				body: `${subStageName} on ${propertyName} is unblocked and ready.`,
				targetUrl: subStageInstanceId ? `/master/stages/${subStageInstanceId}` : null,
			};
		default:
			return {
				title: "Notification",
				body: `${subStageName} on ${propertyName}.`,
				targetUrl: null,
			};
	}
}
