import { tenantMemberships, tenants } from "@repo/db/schema/control";
import {
	masterProfiles,
	notificationIntents,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";
import type { TenantTx as Tx } from "@repo/db/with-tenant";
import {
	DEFAULT_JOB_OPTS,
	getNotificationDispatchQueue,
	type NotificationDispatchJobData,
} from "@repo/queue";
import { and, desc, sql as dsql, eq, isNull, or } from "drizzle-orm";
import { db } from "../../db.ts";

type NotifyType = "STAGE_SUBMITTED" | "STAGE_REJECTED" | "STAGE_BLOCKED" | "STAGE_UNBLOCKED";

/**
 * Phase 8 acceptance-side notification emitter. Writes one
 * `notification_intents` row per target user and returns the created ids so
 * the caller can enqueue dispatch jobs AFTER the tenant tx commits. Dedupe
 * via the existing unique on (target, sub-stage, type) — a retry produces
 * zero new ids.
 *
 * Targeting:
 *   STAGE_SUBMITTED  → all INSPECTOR memberships of the tenant (control-plane lookup)
 *   STAGE_REJECTED   → master who held the most recent assignment for this sub-stage
 *   STAGE_BLOCKED    → master with active assignment (if any)
 *   STAGE_UNBLOCKED  → master with active assignment if any; otherwise all
 *                     masters whose specialization matches (mirrors
 *                     STAGE_AVAILABLE — Phase 8 audit #2)
 */
export async function emitAcceptanceNotificationIntents(
	tx: Tx,
	tenantSchema: string,
	args: {
		type: NotifyType;
		subStageInstanceId: string;
		propertyId: string | null;
		payload?: Record<string, unknown>;
	},
): Promise<string[]> {
	const targets = await resolveTargets(tx, tenantSchema, args.type, args.subStageInstanceId);
	if (targets.length === 0) return [];

	const createdIds: string[] = [];
	for (const targetUserId of targets) {
		const inserted = await tx
			.insert(notificationIntents)
			.values({
				type: args.type,
				targetUserId,
				subStageInstanceId: args.subStageInstanceId,
				propertyId: args.propertyId,
				payload: args.payload ?? null,
			})
			.onConflictDoNothing({
				target: [
					notificationIntents.targetUserId,
					notificationIntents.subStageInstanceId,
					notificationIntents.type,
				],
			})
			.returning({ id: notificationIntents.id });
		for (const row of inserted) createdIds.push(row.id);
	}
	return createdIds;
}

async function resolveTargets(
	tx: Tx,
	tenantSchema: string,
	type: NotifyType,
	subStageInstanceId: string,
): Promise<string[]> {
	if (type === "STAGE_SUBMITTED") {
		// Inspectors live in the control plane membership table — out-of-schema
		// lookup. Use the singleton `db` client (search_path=public) so the
		// tenant tx's `search_path` doesn't shadow `public.tenants` resolution.
		const [t] = await db
			.select({ id: tenants.id })
			.from(tenants)
			.where(eq(tenants.schemaName, tenantSchema))
			.limit(1);
		if (!t) return [];
		const rows = await db
			.select({ userId: tenantMemberships.userId })
			.from(tenantMemberships)
			.where(and(eq(tenantMemberships.tenantId, t.id), eq(tenantMemberships.role, "INSPECTOR")));
		return rows.map((r) => r.userId);
	}

	// REJECTED / BLOCKED / UNBLOCKED → most recent assignee for this sub-stage.
	const [assignment] = await tx
		.select({ masterUserId: subStageAssignments.masterUserId })
		.from(subStageAssignments)
		.where(eq(subStageAssignments.subStageInstanceId, subStageInstanceId))
		.orderBy(desc(subStageAssignments.claimedAt))
		.limit(1);
	if (assignment) return [assignment.masterUserId];

	// Phase 8 audit #2: STAGE_UNBLOCKED on an unclaimed sub-stage is effectively
	// "newly available" — without this branch nobody would ever hear about it.
	// Mirror stage-propagate's STAGE_AVAILABLE targeting (by specialization,
	// honoring availability overrides).
	if (type !== "STAGE_UNBLOCKED") return [];
	const [ss] = await tx
		.select({ specialization: subStageInstances.specialization })
		.from(subStageInstances)
		.where(eq(subStageInstances.id, subStageInstanceId))
		.limit(1);
	const availabilityClause = or(
		isNull(masterProfiles.availabilityOverrideUntil),
		dsql`${masterProfiles.availabilityOverrideUntil} <= now()`,
	);
	const rows = ss?.specialization
		? await tx
				.select({ userId: masterProfiles.userId })
				.from(masterProfiles)
				.where(
					and(
						dsql`${ss.specialization} = ANY(${masterProfiles.specializations})`,
						availabilityClause,
					),
				)
		: await tx
				.select({ userId: masterProfiles.userId })
				.from(masterProfiles)
				.where(availabilityClause);
	return rows.map((r: { userId: string }) => r.userId);
}

/**
 * Enqueue dispatch jobs for freshly-created intent ids. MUST be called AFTER
 * the tenant tx has committed so the worker can read the rows.
 */
export async function enqueueDispatchForIntents(
	tenantSchema: string,
	intentIds: string[],
): Promise<void> {
	if (!process.env.REDIS_URL || intentIds.length === 0) return;
	const q = getNotificationDispatchQueue();
	await Promise.all(
		intentIds.map((intentId) =>
			q.add(
				"notification-dispatch",
				{ tenantSchema, notificationIntentId: intentId } satisfies NotificationDispatchJobData,
				{ ...DEFAULT_JOB_OPTS, jobId: `dispatch-${intentId}` },
			),
		),
	);
}
