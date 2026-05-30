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
	type NotificationKind,
	notificationKeys,
	type PerformerType,
	translateNotification,
} from "@repo/i18n";
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

		const { title, body, targetUrl, params } = await buildContent(
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
				// Persist substitution params so the in-app center and push-delivery
				// can re-render in any locale via @repo/i18n. Title/body above stay
				// as English fallback for old consumers / pre-localization rows.
				localizationParams: params,
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
): Promise<{
	title: string;
	body: string;
	targetUrl: string | null;
	params: Record<string, unknown>;
}> {
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
	let performerType: PerformerType | null = null;
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
			performerType = ss.performerType as PerformerType;
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

	// Params are persisted on the notifications row and re-applied at render
	// time per recipient locale. Keep these primitive + locale-neutral —
	// rendering happens in @repo/i18n catalogs.
	const params: Record<string, unknown> = {
		propertyName,
		subStageName,
		specialization,
		// Pre-formatted suffix so the English template can stay a single string
		// and other locales can choose to include or omit it.
		specializationSuffix: specialization ? ` (${specialization})` : "",
		performerType,
	};

	const isKnownKind =
		type === "STAGE_AVAILABLE" ||
		type === "STAGE_SUBMITTED" ||
		type === "STAGE_REJECTED" ||
		type === "STAGE_BLOCKED" ||
		type === "STAGE_UNBLOCKED";
	const kind: NotificationKind | "FALLBACK" = isKnownKind ? (type as NotificationKind) : "FALLBACK";

	const { titleKey, bodyKey } =
		kind === "FALLBACK"
			? { titleKey: "FALLBACK.title", bodyKey: "FALLBACK.body" }
			: notificationKeys(kind, performerType);

	// Targets are not localizable — derived from type + performer.
	const targetUrl = computeTargetUrl(type, performerType, subStageInstanceId);

	return {
		title: translateNotification("en", titleKey, params),
		body: translateNotification("en", bodyKey, params),
		targetUrl,
		params,
	};
}

function computeTargetUrl(
	type: string,
	performerType: PerformerType | null,
	subStageInstanceId: string | null,
): string | null {
	if (!subStageInstanceId) return null;
	switch (type) {
		case "STAGE_AVAILABLE":
			return performerType === "INSPECTOR"
				? `/inspector/stages/${subStageInstanceId}`
				: `/master/stages/${subStageInstanceId}`;
		case "STAGE_SUBMITTED":
			return `/inspector/queue/${subStageInstanceId}`;
		case "STAGE_REJECTED":
		case "STAGE_BLOCKED":
		case "STAGE_UNBLOCKED":
			return `/master/stages/${subStageInstanceId}`;
		default:
			return null;
	}
}
