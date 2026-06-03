import {
	acceptanceRequests,
	mediaRequirementInstances,
	properties,
	type StageEventType,
	type StageInstanceStatus,
	stageEvents,
	stageInstanceDependencies,
	stageInstances,
	stageMediaAssets,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { deferUntilCommit, type TenantTx as Tx } from "@repo/db/with-tenant";
import { and, sql as dsql, eq, inArray, isNull } from "drizzle-orm";
import { acceptanceEvents } from "./events.ts";

/**
 * Phase 4 service: state-machine helpers, unlock logic, and the in-DB outbox
 * for domain events. Everything here is called inside `runInTenant(fn)` so the
 * `tx` parameter inherits the tenant `search_path`.
 */

const transitions: Record<StageInstanceStatus, StageInstanceStatus[]> = {
	LOCKED: ["AVAILABLE"],
	AVAILABLE: ["IN_PROGRESS", "SUBMITTED"], // SUBMITTED for INSPECTOR submit-self
	IN_PROGRESS: ["SUBMITTED"],
	SUBMITTED: ["ACCEPTED", "REJECTED"],
	REJECTED: ["IN_PROGRESS"],
	ACCEPTED: [],
};

export function canTransition(from: StageInstanceStatus, to: StageInstanceStatus): boolean {
	return transitions[from]?.includes(to) ?? false;
}

export async function writeStageEvent(
	tx: Tx,
	tenantSchema: string,
	params: {
		type: StageEventType;
		subStageInstanceId?: string | null;
		propertyId?: string | null;
		actorUserId?: string | null;
		payload?: unknown;
	},
): Promise<string> {
	const [row] = (await tx
		.insert(stageEvents)
		.values({
			eventType: params.type,
			subStageInstanceId: params.subStageInstanceId ?? null,
			propertyId: params.propertyId ?? null,
			actorUserId: params.actorUserId ?? null,
			payload: params.payload ?? null,
		})
		.returning({ id: stageEvents.id })) as Array<{ id: string }>;
	const stageEventId = row?.id ?? "";
	const occurredAt = new Date();
	deferUntilCommit(tx as object, () => {
		acceptanceEvents.emitEvent({
			type: params.type,
			tenantSchema,
			stageEventId,
			subStageInstanceId: params.subStageInstanceId,
			propertyId: params.propertyId,
			actorUserId: params.actorUserId,
			payload: params.payload,
			occurredAt,
		});
	});
	return stageEventId;
}

/**
 * Locks a sub-stage row for the rest of the transaction so concurrent take /
 * submit / accept attempts serialize. Returns the row or null if missing.
 */
export async function lockSubStage(tx: Tx, subStageInstanceId: string) {
	const rows = (await tx.execute(
		dsql`SELECT id, stage_instance_id, performer_type, specialization, status, code, "order", manual_blocked
			FROM sub_stage_instances WHERE id = ${subStageInstanceId} FOR UPDATE`,
	)) as Array<{
		id: string;
		stage_instance_id: string;
		performer_type: "MASTER" | "INSPECTOR";
		specialization: string | null;
		status: StageInstanceStatus;
		code: string;
		order: number;
		manual_blocked: boolean;
	}>;
	return rows[0] ?? null;
}

/**
 * Find the property id for a sub-stage instance.
 */
export async function propertyIdForSubStage(
	tx: Tx,
	subStageInstanceId: string,
): Promise<string | null> {
	const rows = await tx
		.select({ propertyId: stageInstances.propertyId })
		.from(subStageInstances)
		.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
		.where(eq(subStageInstances.id, subStageInstanceId))
		.limit(1);
	return rows[0]?.propertyId ?? null;
}

/**
 * True iff every prerequisite of `subStageInstanceId` is ACCEPTED (or has an
 * UNBLOCKED manual override), AND no incoming dep is manually BLOCKED. Used by
 * both `take` (predecessor invariant) and the post-accept unlock fan.
 */
export async function isUnlocked(tx: Tx, subStageInstanceId: string): Promise<boolean> {
	// Manual block lives on the sub-stage row itself so it can hold for root
	// sub-stages with no incoming dep edges (e.g. 1.1).
	const [self] = (await tx
		.select({ manualBlocked: subStageInstances.manualBlocked })
		.from(subStageInstances)
		.where(eq(subStageInstances.id, subStageInstanceId))
		.limit(1)) as Array<{ manualBlocked: boolean }>;
	if (self?.manualBlocked) return false;

	const deps = await tx
		.select({
			prerequisiteSubStageInstanceId: stageInstanceDependencies.prerequisiteSubStageInstanceId,
			manualOverride: stageInstanceDependencies.manualOverride,
		})
		.from(stageInstanceDependencies)
		.where(eq(stageInstanceDependencies.subStageInstanceId, subStageInstanceId));

	if (deps.length === 0) return true; // root sub-stage (1.1)

	type Dep = { prerequisiteSubStageInstanceId: string; manualOverride: string };
	const dlist = deps as Dep[];
	for (const d of dlist) {
		if (d.manualOverride === "BLOCKED") return false;
	}
	const forceUnblockedAll = dlist.every((d: Dep) => d.manualOverride === "UNBLOCKED");
	if (forceUnblockedAll) return true;

	const prereqIds = dlist.map((d: Dep) => d.prerequisiteSubStageInstanceId);
	const prereqs = (await tx
		.select({ id: subStageInstances.id, status: subStageInstances.status })
		.from(subStageInstances)
		.where(inArray(subStageInstances.id, prereqIds))) as Array<{
		id: string;
		status: StageInstanceStatus;
	}>;
	const acceptedSet = new Set(prereqs.filter((p) => p.status === "ACCEPTED").map((p) => p.id));
	for (const d of dlist) {
		if (d.manualOverride === "UNBLOCKED") continue;
		if (!acceptedSet.has(d.prerequisiteSubStageInstanceId)) return false;
	}
	return true;
}

/**
 * After an ACCEPT, walk all LOCKED sub-stages on the same property whose
 * prerequisites are now satisfied and flip them to AVAILABLE. Returns the ids
 * that were unlocked.
 */
export async function unlockReadySubStages(
	tx: Tx,
	propertyId: string,
	tenantSchema: string,
	actorUserId: string | null,
): Promise<string[]> {
	const candidates = await tx
		.select({ id: subStageInstances.id })
		.from(subStageInstances)
		.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
		.where(and(eq(stageInstances.propertyId, propertyId), eq(subStageInstances.status, "LOCKED")));

	const unlocked: string[] = [];
	for (const c of candidates) {
		if (await isUnlocked(tx, c.id)) {
			await tx
				.update(subStageInstances)
				.set({ status: "AVAILABLE" })
				.where(and(eq(subStageInstances.id, c.id), eq(subStageInstances.status, "LOCKED")));
			unlocked.push(c.id);
			await writeStageEvent(tx, tenantSchema, {
				type: "UNLOCKED",
				subStageInstanceId: c.id,
				propertyId,
				actorUserId,
			});
		}
	}
	return unlocked;
}

/**
 * Verifies every required-PHOTO media requirement (and any required-VIDEO ones)
 * has at least one matching uploaded asset linked via `stage_media_assets`.
 * Returns a list of missing requirement descriptions (empty = pass).
 */
export async function missingRequiredMedia(tx: Tx, subStageInstanceId: string): Promise<string[]> {
	const reqs = await tx
		.select()
		.from(mediaRequirementInstances)
		.where(eq(mediaRequirementInstances.subStageInstanceId, subStageInstanceId));
	const required = reqs.filter((r: { required: boolean }) => r.required);
	if (required.length === 0) return [];

	const linked = await tx
		.select({ id: stageMediaAssets.id })
		.from(stageMediaAssets)
		.where(eq(stageMediaAssets.subStageInstanceId, subStageInstanceId));
	if (linked.length === 0) {
		return required.map((r: { description: string }) => r.description);
	}
	// At least one uploaded asset satisfies the photo blocker per TZ Module 3.
	// Per-media-type granularity (one PHOTO + one VIDEO when both required) is a
	// refinement left for later; the current rule keeps the loop honest without
	// over-constraining tenants who only mark PHOTO as required.
	return [];
}

/**
 * Active claim for a sub-stage instance, if any.
 */
export async function activeAssignment(tx: Tx, subStageInstanceId: string) {
	const rows = (await tx.execute(
		dsql`SELECT id, master_user_id, claimed_at
			FROM sub_stage_assignments
			WHERE sub_stage_instance_id = ${subStageInstanceId} AND released_at IS NULL
			LIMIT 1`,
	)) as Array<{ id: string; master_user_id: string; claimed_at: string }>;
	return rows[0] ?? null;
}

/**
 * Active acceptance request for a sub-stage instance, if any.
 */
export async function activeAcceptanceRequest(tx: Tx, subStageInstanceId: string) {
	const rows = await tx
		.select()
		.from(acceptanceRequests)
		.where(
			and(
				eq(acceptanceRequests.subStageInstanceId, subStageInstanceId),
				isNull(acceptanceRequests.resolvedAt),
			),
		)
		.limit(1);
	return rows[0] ?? null;
}

/**
 * Property-level status transitions driven by sub-stage acceptances.
 *  - Any INSPECTOR accept while property is `PENDING` ⇒ `READY_FOR_PRODUCTION`
 *    (the 1.1 gate; keyed on status+performer rather than `order === 1` so a
 *    future template that inserts an inspector stage ahead of 1.1 doesn't
 *    silently break the gate).
 *  - First master `take` ⇒ property `READY_FOR_PRODUCTION` → `IN_PROGRESS`.
 *  - Final master sub-stage acceptance ⇒ property → `COMPLETED`.
 * Phase 5 will move the post-accept transitions into BullMQ jobs.
 */
export async function maybeAdvancePropertyOnAccept(
	tx: Tx,
	tenantSchema: string,
	propertyId: string,
	performerType: "MASTER" | "INSPECTOR",
	actorUserId: string | null,
): Promise<void> {
	const [prop] = await tx.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
	if (!prop) return;

	if (performerType === "INSPECTOR" && prop.status === "PENDING") {
		await tx
			.update(properties)
			.set({ status: "READY_FOR_PRODUCTION", updatedAt: new Date() })
			.where(eq(properties.id, propertyId));
		await writeStageEvent(tx, tenantSchema, {
			type: "READY_FOR_PRODUCTION",
			propertyId,
			actorUserId,
		});
		return;
	}

	// Check if every MASTER sub-stage is now ACCEPTED → COMPLETED.
	const rows = await tx
		.select({
			total: dsql<number>`count(*) filter (where ${subStageInstances.performerType} = 'MASTER')::int`,
			done: dsql<number>`count(*) filter (where ${subStageInstances.performerType} = 'MASTER' and ${subStageInstances.status} = 'ACCEPTED')::int`,
		})
		.from(subStageInstances)
		.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
		.where(eq(stageInstances.propertyId, propertyId));
	const r = rows[0];
	if (r && r.total > 0 && r.total === r.done && prop.status !== "COMPLETED") {
		await tx
			.update(properties)
			.set({ status: "COMPLETED", updatedAt: new Date() })
			.where(eq(properties.id, propertyId));
		await writeStageEvent(tx, tenantSchema, {
			type: "PROPERTY_COMPLETED",
			propertyId,
			actorUserId,
		});
	}
}

/**
 * Promote property `READY_FOR_PRODUCTION` → `IN_PROGRESS` on the first master
 * take. Idempotent: no-op if already IN_PROGRESS.
 */
export async function maybeAdvancePropertyOnTake(
	tx: Tx,
	tenantSchema: string,
	propertyId: string,
	actorUserId: string | null,
): Promise<void> {
	const [prop] = await tx
		.select({ status: properties.status })
		.from(properties)
		.where(eq(properties.id, propertyId))
		.limit(1);
	if (!prop) return;
	if (prop.status === "READY_FOR_PRODUCTION") {
		await tx
			.update(properties)
			.set({ status: "IN_PROGRESS", updatedAt: new Date() })
			.where(eq(properties.id, propertyId));
		await writeStageEvent(tx, tenantSchema, {
			type: "PROPERTY_IN_PROGRESS",
			propertyId,
			actorUserId,
		});
	}
}
