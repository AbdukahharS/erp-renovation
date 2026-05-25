import {
	acceptanceRequests,
	masterRatings,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { and, sql as dsql, eq, isNotNull } from "drizzle-orm";

// biome-ignore lint/suspicious/noExplicitAny: drizzle transaction shape
type Tx = any;

/**
 * Phase 6 rating counters.
 *
 * Recomputes raw counts and the average duration ratio (actual / standard) for
 * a master from scratch off the events tables. No composite score — Phase 9
 * will compute one on top of these counters.
 *
 * Idempotent: re-running for the same master converges to the same row.
 */
export async function recomputeMasterRating(tx: Tx, masterUserId: string): Promise<void> {
	// Credit a resolved acceptance request to a master only when that master's
	// assignment was active across the request's lifetime: claimed at or before
	// the request was submitted, and not released before the request was
	// submitted. Without this, a sub-stage that was claimed by A, released, then
	// claimed by B before B's submission would also credit A.
	const rows = await tx
		.select({
			resolution: acceptanceRequests.resolution,
			submittedAt: acceptanceRequests.submittedAt,
			resolvedAt: acceptanceRequests.resolvedAt,
			claimedAt: subStageAssignments.claimedAt,
			standardDurationDays: subStageInstances.standardDurationDays,
		})
		.from(acceptanceRequests)
		.innerJoin(subStageInstances, eq(subStageInstances.id, acceptanceRequests.subStageInstanceId))
		.innerJoin(
			subStageAssignments,
			and(
				eq(subStageAssignments.subStageInstanceId, acceptanceRequests.subStageInstanceId),
				eq(subStageAssignments.masterUserId, masterUserId),
				dsql`${subStageAssignments.claimedAt} <= ${acceptanceRequests.submittedAt}`,
				dsql`(${subStageAssignments.releasedAt} IS NULL OR ${subStageAssignments.releasedAt} > ${acceptanceRequests.submittedAt})`,
			),
		)
		.where(isNotNull(acceptanceRequests.resolvedAt));

	let accepted = 0;
	let rejected = 0;
	let ratioSum = 0;
	let ratioCount = 0;
	for (const r of rows as Array<{
		resolution: "ACCEPTED" | "REJECTED" | null;
		submittedAt: Date;
		resolvedAt: Date | null;
		claimedAt: Date;
		standardDurationDays: number;
	}>) {
		if (r.resolution === "ACCEPTED") {
			accepted += 1;
			if (r.resolvedAt && r.standardDurationDays > 0) {
				const actualMs = r.resolvedAt.getTime() - r.claimedAt.getTime();
				const standardMs = r.standardDurationDays * 86400_000;
				const ratio = Math.min(3, Math.max(0, actualMs / standardMs));
				ratioSum += ratio;
				ratioCount += 1;
			}
		} else if (r.resolution === "REJECTED") {
			rejected += 1;
		}
	}
	const avgRatio = ratioCount > 0 ? ratioSum / ratioCount : null;

	await tx
		.insert(masterRatings)
		.values({
			masterUserId,
			acceptedCount: accepted,
			rejectedCount: rejected,
			avgDurationRatio: avgRatio !== null ? avgRatio.toFixed(3) : null,
			computedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: masterRatings.masterUserId,
			set: {
				acceptedCount: accepted,
				rejectedCount: rejected,
				avgDurationRatio: avgRatio !== null ? avgRatio.toFixed(3) : null,
				computedAt: new Date(),
			},
		});
}
