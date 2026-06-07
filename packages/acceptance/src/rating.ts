import {
	acceptanceRequests,
	masterRatings,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";
import type { TenantTx as Tx } from "@repo/db/with-tenant";
import { and, sql as dsql, eq, isNotNull } from "drizzle-orm";

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
	// Weighted by standardDurationDays so a 14-day stage outweighs a 1-day stage —
	// otherwise a master who blows the deadline on a single long stage looks the
	// same as one who slips a one-day touch-up.
	let ratioWeightedSum = 0;
	let weightSum = 0;
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
				ratioWeightedSum += ratio * r.standardDurationDays;
				weightSum += r.standardDurationDays;
			}
		} else if (r.resolution === "REJECTED") {
			rejected += 1;
		}
	}
	const avgRatio = weightSum > 0 ? ratioWeightedSum / weightSum : null;

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

/**
 * Phase 9 composite rating score derived from raw counters + tenant-configured
 * weights. Returns a 0–100 score where 100 is best, together with the component
 * sub-scores so the UI can show masters *why* they're rated as they are
 * (transparent on purpose — opaque ratings get disputed).
 *
 * Formula:
 *   acceptanceRate = accepted / (accepted + rejected)
 *   speedScore     = clamp(2 - avgDurationRatio, 0, 1)   // 1.0 = on time, 0.0 = ≥2x late
 *   defectScore    = acceptanceRate                       // 1.0 = no rejections
 *
 * When `avgDurationRatio` is null (only rejections so far, or no
 * standard-duration data), the composite collapses to defectScore only —
 * we deliberately do NOT fall back to acceptanceRate-as-speedScore, which
 * double-weighted the same signal.
 *
 *   composite = 100 * (wSpeed * speedScore + wDefect * defectScore) / (wSpeed + wDefect)
 *
 * With no resolved requests, score is null (not zero) so the UI can
 * distinguish "unrated" from "rated badly."
 */
export interface RatingCounters {
	acceptedCount: number;
	rejectedCount: number;
	avgDurationRatio: number | null;
}

export interface RatingWeights {
	speed: number;
	defect: number;
}

export interface RatingBreakdown {
	score: number;
	acceptanceRate: number;
	speedScore: number | null;
	defectScore: number;
}

export function computeRatingBreakdown(
	counters: RatingCounters,
	weights: RatingWeights,
): RatingBreakdown | null {
	const total = counters.acceptedCount + counters.rejectedCount;
	if (total === 0) return null;
	const acceptanceRate = counters.acceptedCount / total;
	const defectScore = acceptanceRate;
	const speedScore =
		counters.avgDurationRatio === null
			? null
			: Math.min(1, Math.max(0, 2 - counters.avgDurationRatio));

	const wSpeed = Math.max(0, weights.speed);
	const wDefect = Math.max(0, weights.defect);

	let raw: number;
	if (speedScore === null) {
		// Speed signal absent — defect alone drives the score; weights are
		// irrelevant in this branch.
		raw = defectScore;
	} else {
		const wSum = wSpeed + wDefect;
		// Defensive: validation guarantees wSum > 0, but if a stale config slips
		// through, fall back to a simple mean of the two component scores rather
		// than double-counting defect.
		raw =
			wSum > 0
				? (wSpeed * speedScore + wDefect * defectScore) / wSum
				: (speedScore + defectScore) / 2;
	}
	return {
		score: Math.round(100 * raw),
		acceptanceRate,
		speedScore,
		defectScore,
	};
}

export function computeRatingScore(
	counters: RatingCounters,
	weights: RatingWeights,
): number | null {
	return computeRatingBreakdown(counters, weights)?.score ?? null;
}
