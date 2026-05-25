import { maybeAdvancePropertyOnAccept, unlockReadySubStages } from "@repo/acceptance/service";
import { masterProfiles, notificationIntents, subStageInstances } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import type { StagePropagateJobData } from "@repo/queue";
import { and, sql as dsql, eq, inArray } from "drizzle-orm";
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
	return await withTenant(db, tenantSchema, async (tx) => {
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
			const targets = ssi.specialization
				? await tx
						.select({ userId: masterProfiles.userId })
						.from(masterProfiles)
						.where(dsql`${ssi.specialization} = ANY(${masterProfiles.specializations})`)
				: await tx.select({ userId: masterProfiles.userId }).from(masterProfiles);

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
			}
		}

		return { unlocked, notificationsCreated };
	});
}
