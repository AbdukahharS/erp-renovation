import { recomputeMasterRating } from "@repo/acceptance/rating";
import { maybeAdvancePropertyOnAccept, unlockReadySubStages } from "@repo/acceptance/service";
import {
	masterProfiles,
	notificationIntents,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import {
	DEFAULT_JOB_OPTS,
	getNotificationDispatchQueue,
	publishToTenant,
	type StagePropagateJobData,
} from "@repo/queue";
import { and, sql as dsql, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db.ts";

/**
 * Runs the post-accept fan-out that Phase 4 used to do synchronously inside
 * the request transaction:
 *  - unlock LOCKED sub-stages whose prerequisites are now satisfied
 *  - advance the property state machine (READY_FOR_PRODUCTION / COMPLETED)
 *  - create one `notification_intents` row per matching master for each newly
 *    AVAILABLE sub-stage (delivery is Phase 8; this job only writes the intent)
 *
 * Idempotent: `unlockReadySubStages` re-checks current statuses and won't flip
 * a non-LOCKED row; the notification_intents unique constraint absorbs retries.
 */
export async function processStagePropagate(job: {
	data: StagePropagateJobData;
}): Promise<{ unlocked: string[]; notificationsCreated: number }> {
	const { tenantSchema, subStageInstanceId, propertyId, actorUserId } = job.data;
	const createdIntentIds: string[] = [];
	const result = await withTenant(db, tenantSchema, async (tx) => {
		const [ss] = await tx
			.select({
				status: subStageInstances.status,
				performerType: subStageInstances.performerType,
			})
			.from(subStageInstances)
			.where(eq(subStageInstances.id, subStageInstanceId))
			.limit(1);
		if (!ss || ss.status !== "ACCEPTED") {
			return { unlocked: [], notificationsCreated: 0 };
		}

		const unlocked = await unlockReadySubStages(tx, propertyId, tenantSchema, actorUserId ?? null);
		await maybeAdvancePropertyOnAccept(
			tx,
			tenantSchema,
			propertyId,
			ss.performerType,
			actorUserId ?? null,
		);

		// Phase 6: recompute the accepting master's rating counters. Master-performed
		// sub-stages always carry an assignment; for inspector-performed ones there's
		// nothing to score.
		if (ss.performerType === "MASTER") {
			const [assignment] = await tx
				.select({ masterUserId: subStageAssignments.masterUserId })
				.from(subStageAssignments)
				.where(eq(subStageAssignments.subStageInstanceId, subStageInstanceId))
				.limit(1);
			if (assignment) {
				await recomputeMasterRating(tx, assignment.masterUserId);
			}
		}

		if (unlocked.length === 0) {
			return { unlocked, notificationsCreated: 0 };
		}

		// Pull the newly-AVAILABLE MASTER sub-stages with their specialization.
		const newlyAvailable = await tx
			.select({
				id: subStageInstances.id,
				specialization: subStageInstances.specialization,
				performerType: subStageInstances.performerType,
			})
			.from(subStageInstances)
			.where(
				and(inArray(subStageInstances.id, unlocked), eq(subStageInstances.performerType, "MASTER")),
			);

		let notificationsCreated = 0;
		for (const ssi of newlyAvailable) {
			// Notify all masters whose specializations array contains the required
			// specialization (or every master if the sub-stage has no specialization).
			// Skip masters whose manual availability override is still in effect.
			const availabilityClause = or(
				isNull(masterProfiles.availabilityOverrideUntil),
				dsql`${masterProfiles.availabilityOverrideUntil} <= now()`,
			);
			const targets = ssi.specialization
				? await tx
						.select({ userId: masterProfiles.userId })
						.from(masterProfiles)
						.where(
							and(
								dsql`${ssi.specialization} = ANY(${masterProfiles.specializations})`,
								availabilityClause,
							),
						)
				: await tx
						.select({ userId: masterProfiles.userId })
						.from(masterProfiles)
						.where(availabilityClause);

			for (const t of targets) {
				const inserted = await tx
					.insert(notificationIntents)
					.values({
						type: "STAGE_AVAILABLE",
						targetUserId: t.userId,
						subStageInstanceId: ssi.id,
						propertyId,
						payload: { specialization: ssi.specialization },
					})
					.onConflictDoNothing({
						target: [
							notificationIntents.targetUserId,
							notificationIntents.subStageInstanceId,
							notificationIntents.type,
						],
					})
					.returning({ id: notificationIntents.id });
				notificationsCreated += inserted.length;
				for (const row of inserted) createdIntentIds.push(row.id);
			}
		}

		return { unlocked, notificationsCreated };
	});

	// Phase 8: hand each fresh intent to the dispatch queue. Idempotent — the
	// dispatcher itself bails on already-SENT intents and the outbox poller
	// re-enqueues anything stranded by a crash here.
	if (process.env.REDIS_URL && createdIntentIds.length > 0) {
		const q = getNotificationDispatchQueue();
		for (const intentId of createdIntentIds) {
			await q.add(
				"notification-dispatch",
				{ tenantSchema, notificationIntentId: intentId },
				{ ...DEFAULT_JOB_OPTS, jobId: `dispatch-${intentId}` },
			);
		}
	}

	// Phase 8: realtime fan-out so connected dashboards refetch.
	if (result.unlocked.length > 0) {
		publishToTenant(tenantSchema, {
			kind: "STAGE_ACCEPTED",
			propertyId,
			subStageInstanceId,
		});
	}

	return result;
}
