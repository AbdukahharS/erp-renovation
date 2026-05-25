import {
	financialTransactions,
	masterBalances,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import type { WageCreditJobData } from "@repo/queue";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";

/**
 * Credits the frozen wage of a just-accepted sub-stage to the master's virtual
 * balance and records a `WAGE_CREDIT` + matching `BUDGET_DECREMENT` financial
 * transaction. Idempotent via the `(sub_stage_instance_id, type)` unique
 * constraint on `financial_transactions`: a retry that re-runs after the rows
 * already exist is a no-op and does NOT touch `master_balances`.
 *
 * INSPECTOR-performed sub-stages (e.g. 1.1) have wage_amount = 0 and no
 * assignment row — we still write the zero-amount transaction rows so the
 * ledger has a record per accepted stage.
 */
export async function processWageCredit(job: { data: WageCreditJobData }): Promise<void> {
	const { tenantSchema, subStageInstanceId } = job.data;
	await withTenant(db, tenantSchema, async (tx) => {
		const [ss] = await tx
			.select({
				id: subStageInstances.id,
				performerType: subStageInstances.performerType,
				wageAmount: subStageInstances.wageAmount,
				status: subStageInstances.status,
			})
			.from(subStageInstances)
			.where(eq(subStageInstances.id, subStageInstanceId))
			.limit(1);
		if (!ss) return; // already gone (cascade delete); nothing to do
		if (ss.status !== "ACCEPTED") return; // stale retry — never credit a non-accepted stage

		// Find the master via the most recent assignment (released_at may be set by
		// Phase 4's accept handler — we want the master who actually did the work).
		const [assignment] = await tx
			.select({ masterUserId: subStageAssignments.masterUserId })
			.from(subStageAssignments)
			.where(eq(subStageAssignments.subStageInstanceId, subStageInstanceId))
			.orderBy(dsql`claimed_at DESC`)
			.limit(1);

		const propertyId = await propertyIdForSubStage(tx, subStageInstanceId);
		const masterUserId = assignment?.masterUserId ?? null;
		const wageAmount = ss.wageAmount; // numeric -> string

		const wageInsert = await tx
			.insert(financialTransactions)
			.values({
				type: "WAGE_CREDIT",
				masterUserId,
				propertyId,
				subStageInstanceId,
				amount: wageAmount,
				description: `Wage credit for sub-stage ${subStageInstanceId}`,
			})
			.onConflictDoNothing({
				target: [financialTransactions.subStageInstanceId, financialTransactions.type],
			})
			.returning({ id: financialTransactions.id });

		// Mirror the same insert for BUDGET_DECREMENT so Phase 7's Plan-vs-Actual
		// can derive remaining budget as plannedUnitCost*area − sum(BUDGET_DECREMENT).
		await tx
			.insert(financialTransactions)
			.values({
				type: "BUDGET_DECREMENT",
				masterUserId,
				propertyId,
				subStageInstanceId,
				amount: wageAmount,
				description: `Budget decrement for sub-stage ${subStageInstanceId}`,
			})
			.onConflictDoNothing({
				target: [financialTransactions.subStageInstanceId, financialTransactions.type],
			});

		// Only bump the master's running balance if the WAGE_CREDIT row was actually
		// inserted by THIS call. If onConflictDoNothing swallowed the insert, a
		// previous job already credited the balance — must not double-count.
		if (wageInsert.length > 0 && masterUserId && Number(wageAmount) > 0) {
			await tx
				.insert(masterBalances)
				.values({ masterUserId, balance: wageAmount })
				.onConflictDoUpdate({
					target: masterBalances.masterUserId,
					set: {
						balance: dsql`${masterBalances.balance} + ${wageAmount}::numeric`,
						updatedAt: new Date(),
					},
				});
		}
	});
}

async function propertyIdForSubStage(
	// biome-ignore lint/suspicious/noExplicitAny: tx is the inner Drizzle transaction
	tx: any,
	subStageInstanceId: string,
): Promise<string | null> {
	const rows = (await tx.execute(
		dsql`SELECT si.property_id AS property_id
			FROM sub_stage_instances ssi
			JOIN stage_instances si ON si.id = ssi.stage_instance_id
			WHERE ssi.id = ${subStageInstanceId}
			LIMIT 1`,
	)) as Array<{ property_id: string | null }>;
	return rows[0]?.property_id ?? null;
}
