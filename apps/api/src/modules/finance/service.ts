import {
	type FinancialTransactionType,
	financialTransactions,
	fines,
	masterBalances,
	masterProfiles,
	payoutSettlements,
	portfolioAssets,
	properties,
	propertyAssets,
	type propertyCostCategoryEnum,
	propertyCosts,
	stageInstances,
	subStageInstances,
	unitClosings,
} from "@repo/db/schema/tenant";
import type { TenantTx as Tx } from "@repo/db/with-tenant";
import type {
	ApplyFineInput,
	CloseUnitInput,
	CreatePropertyCostInput,
	MarkPayoutInput,
	PropertyFinanceSummary,
} from "@repo/validators";
import { and, desc, sql as dsql, eq, inArray, isNull } from "drizzle-orm";

const COST_CATEGORY_TO_TX_TYPE: Record<
	(typeof propertyCostCategoryEnum.enumValues)[number],
	FinancialTransactionType
> = {
	TRANSPORT: "TRANSPORT_COST",
	EXTERNAL_CONTRACTOR: "EXTERNAL_CONTRACTOR_COST",
	OTHER: "OTHER_COST",
};

/**
 * Insert a manual property cost. Writes the canonical `financial_transactions`
 * row first, then the authoring row that references it. Both live in the same
 * DB transaction so the dashboard can aggregate solely from
 * `financial_transactions` without UNION-ing the authoring table.
 */
export async function recordPropertyCost(
	tx: Tx,
	args: {
		propertyId: string;
		input: CreatePropertyCostInput;
		createdBy: string;
	},
): Promise<{ costId: string; transactionId: string }> {
	const txType = COST_CATEGORY_TO_TX_TYPE[args.input.category];
	const [txn] = await tx
		.insert(financialTransactions)
		.values({
			type: txType,
			propertyId: args.propertyId,
			amount: args.input.amount,
			description: args.input.description ?? null,
		})
		.returning({ id: financialTransactions.id });
	if (!txn) throw new Error("failed to insert financial transaction");
	const [cost] = await tx
		.insert(propertyCosts)
		.values({
			propertyId: args.propertyId,
			category: args.input.category,
			amount: args.input.amount,
			description: args.input.description ?? null,
			incurredAt: args.input.incurredAt ? new Date(args.input.incurredAt) : new Date(),
			createdBy: args.createdBy,
			transactionId: txn.id,
		})
		.returning({ id: propertyCosts.id });
	if (!cost) throw new Error("failed to insert property cost");
	return { costId: cost.id, transactionId: txn.id };
}

/**
 * Reverse a property cost. Inserts an inverse REVERSAL transaction (mirrors
 * the original amount as negative) and stamps the authoring row as reversed.
 * No effect on master balances — these costs never touched a balance.
 */
export async function reversePropertyCost(
	tx: Tx,
	args: { propertyId: string; costId: string; reversedBy: string },
): Promise<boolean> {
	const [cost] = await tx
		.select()
		.from(propertyCosts)
		.where(and(eq(propertyCosts.id, args.costId), eq(propertyCosts.propertyId, args.propertyId)))
		.limit(1);
	if (!cost) return false;
	if (cost.reversedAt) return false;
	const negAmount = `-${cost.amount}`;
	await tx.insert(financialTransactions).values({
		type: "REVERSAL",
		propertyId: cost.propertyId,
		amount: negAmount,
		description: `Reversal of cost ${cost.id}`,
	});
	await tx
		.update(propertyCosts)
		.set({ reversedAt: new Date(), reversedBy: args.reversedBy })
		.where(eq(propertyCosts.id, cost.id));
	return true;
}

/**
 * Apply a fine to a master. Writes a negative-amount `FINE` financial
 * transaction (so the balance ledger sums correctly: balance = wages − fines
 * − settlements) and decrements `master_balances`. The `fines` row is the
 * authoring record and links back to the originating rejection if provided.
 */
export async function applyFine(
	tx: Tx,
	args: {
		masterUserId: string;
		propertyId: string | null;
		rejectionId: string | null;
		input: ApplyFineInput;
		appliedBy: string;
	},
): Promise<{ fineId: string }> {
	const negAmount = `-${args.input.amount}`;
	const [txn] = await tx
		.insert(financialTransactions)
		.values({
			type: "FINE",
			masterUserId: args.masterUserId,
			propertyId: args.propertyId,
			amount: negAmount,
			description: `Fine: ${args.input.reason}`,
		})
		.returning({ id: financialTransactions.id });
	if (!txn) throw new Error("failed to insert fine transaction");
	const [fine] = await tx
		.insert(fines)
		.values({
			masterUserId: args.masterUserId,
			propertyId: args.propertyId,
			rejectionId: args.rejectionId,
			amount: args.input.amount,
			reason: args.input.reason,
			appliedBy: args.appliedBy,
			transactionId: txn.id,
		})
		.returning({ id: fines.id });
	if (!fine) throw new Error("failed to insert fine");

	await tx
		.insert(masterBalances)
		.values({ masterUserId: args.masterUserId, balance: negAmount })
		.onConflictDoUpdate({
			target: masterBalances.masterUserId,
			set: {
				balance: dsql`${masterBalances.balance} - ${args.input.amount}::numeric`,
				updatedAt: new Date(),
			},
		});
	return { fineId: fine.id };
}

/**
 * Mark a payout as settled against a master's balance. Writes a negative
 * `PAYOUT_SETTLEMENT` transaction and decrements the running balance. The
 * settlement row is the audit trail for "I paid this master $X on date Y".
 */
export async function markPayoutSettled(
	tx: Tx,
	args: { masterUserId: string; input: MarkPayoutInput; settledBy: string },
): Promise<{ settlementId: string }> {
	const negAmount = `-${args.input.amount}`;
	const [txn] = await tx
		.insert(financialTransactions)
		.values({
			type: "PAYOUT_SETTLEMENT",
			masterUserId: args.masterUserId,
			amount: negAmount,
			description: args.input.note ?? "Payout settled",
		})
		.returning({ id: financialTransactions.id });
	if (!txn) throw new Error("failed to insert payout transaction");
	const [settlement] = await tx
		.insert(payoutSettlements)
		.values({
			masterUserId: args.masterUserId,
			amount: args.input.amount,
			note: args.input.note ?? null,
			settledBy: args.settledBy,
			transactionId: txn.id,
		})
		.returning({ id: payoutSettlements.id });
	if (!settlement) throw new Error("failed to insert payout settlement");

	await tx
		.insert(masterBalances)
		.values({ masterUserId: args.masterUserId, balance: negAmount })
		.onConflictDoUpdate({
			target: masterBalances.masterUserId,
			set: {
				balance: dsql`${masterBalances.balance} - ${args.input.amount}::numeric`,
				updatedAt: new Date(),
			},
		});
	return { settlementId: settlement.id };
}

/** Aggregate sums grouped by transaction type for one property. */
async function txnSumsForProperty(
	tx: Tx,
	propertyId: string,
): Promise<Map<FinancialTransactionType, number>> {
	const rows = (await tx
		.select({
			type: financialTransactions.type,
			total: dsql<string>`coalesce(sum(${financialTransactions.amount}), 0)::text`,
		})
		.from(financialTransactions)
		.where(eq(financialTransactions.propertyId, propertyId))
		.groupBy(financialTransactions.type)) as Array<{
		type: FinancialTransactionType;
		total: string;
	}>;
	const m = new Map<FinancialTransactionType, number>();
	for (const r of rows) m.set(r.type, Number(r.total));
	return m;
}

function num(n: number): string {
	return n.toFixed(2);
}

/**
 * Build a Plan-vs-Actual summary for one property. Net profit per TZ §8.2:
 *   plannedTotal − wages − materialCosts − transport − externalContractor
 *   − otherCosts − reversals (already negative)
 * Fines OFFSET wages from the property's perspective (they refund cost), so
 * they reduce actual.
 */
export async function buildPropertyFinanceSummary(
	tx: Tx,
	propertyId: string,
): Promise<PropertyFinanceSummary | null> {
	const [prop] = await tx
		.select({
			id: properties.id,
			name: properties.name,
			areaSqm: properties.areaSqm,
			plannedUnitCost: properties.plannedUnitCost,
			status: properties.status,
		})
		.from(properties)
		.where(eq(properties.id, propertyId))
		.limit(1);
	if (!prop) return null;

	const sums = await txnSumsForProperty(tx, propertyId);
	const plannedTotal = Number(prop.plannedUnitCost) * Number(prop.areaSqm);
	const wages = sums.get("WAGE_CREDIT") ?? 0;
	const material = sums.get("MATERIAL_COST") ?? 0;
	const transport = sums.get("TRANSPORT_COST") ?? 0;
	const externalContractor = sums.get("EXTERNAL_CONTRACTOR_COST") ?? 0;
	const other = sums.get("OTHER_COST") ?? 0;
	const reversal = sums.get("REVERSAL") ?? 0; // already negative
	const finesAgainstProperty = sums.get("FINE") ?? 0; // already negative; offsets wages
	const costsTotal = material + transport + externalContractor + other + reversal;
	// Actual = wages paid + non-wage costs (post reversals) + fines (negative).
	const actualTotal = wages + costsTotal + finesAgainstProperty;
	const netProfit = plannedTotal - actualTotal;

	// Materials-incomplete badge: zero MATERIAL transactions but at least one
	// accepted MASTER sub-stage. Sub-stage 1.1 (INSPECTOR) acceptance must NOT
	// trigger the badge — materials only start consuming on the first master
	// stage. Earlier draft used all sub-stages and false-flagged at Ready-for-
	// Production.
	const acceptedRows = (await tx
		.select({
			accepted: dsql<number>`count(*) filter (where ${subStageInstances.status} = 'ACCEPTED' and ${subStageInstances.performerType} = 'MASTER')::int`,
		})
		.from(subStageInstances)
		.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
		.where(eq(stageInstances.propertyId, propertyId))) as Array<{ accepted: number }>;
	const accepted = acceptedRows[0]?.accepted ?? 0;
	const materialsEstimateMissing = (sums.get("MATERIAL_COST") ?? 0) === 0 && accepted > 0;

	// Active closing only — a previously-reopened row stays as audit history but
	// shouldn't surface here.
	const [closing] = await tx
		.select({ closedAt: unitClosings.closedAt })
		.from(unitClosings)
		.where(and(eq(unitClosings.propertyId, propertyId), isNull(unitClosings.reopenedAt)))
		.limit(1);

	return {
		propertyId: prop.id,
		propertyName: prop.name,
		areaSqm: prop.areaSqm,
		plannedUnitCost: prop.plannedUnitCost,
		plannedTotal: num(plannedTotal),
		accruedWages: num(wages),
		materialsCost: num(material),
		// MATERIAL is omitted from the per-category authoring breakdown because
		// material costs originate from warehouse issuances now, not manual cost
		// authoring. The `material` total still flows into `costsTotal` and the
		// dashboard's dedicated Materials section reads it separately.
		costsByCategory: [
			{ category: "TRANSPORT", total: num(transport) },
			{ category: "EXTERNAL_CONTRACTOR", total: num(externalContractor) },
			{ category: "OTHER", total: num(other) },
		],
		costsTotal: num(costsTotal),
		finesTotal: num(finesAgainstProperty),
		actualTotal: num(actualTotal),
		netProfit: num(netProfit),
		onBudget: netProfit >= 0,
		materialsEstimateMissing,
		status: prop.status,
		closedAt: closing?.closedAt ?? null,
	};
}

export async function listPropertyFinanceSummaries(tx: Tx): Promise<PropertyFinanceSummary[]> {
	const rows = await tx.select({ id: properties.id }).from(properties);
	const out: PropertyFinanceSummary[] = [];
	for (const r of rows) {
		const s = await buildPropertyFinanceSummary(tx, r.id);
		if (s) out.push(s);
	}
	return out;
}

/** Master finance view: balance, ledger, and payout history. */
export async function buildMasterFinanceView(
	tx: Tx,
	masterUserId: string,
): Promise<{
	masterUserId: string;
	balance: string;
	wagesCredited: string;
	finesDeducted: string;
	payoutsSettled: string;
	transactions: Array<typeof financialTransactions.$inferSelect>;
	settlements: Array<typeof payoutSettlements.$inferSelect>;
}> {
	const [bal] = await tx
		.select()
		.from(masterBalances)
		.where(eq(masterBalances.masterUserId, masterUserId))
		.limit(1);
	const txns = await tx
		.select()
		.from(financialTransactions)
		.where(eq(financialTransactions.masterUserId, masterUserId))
		.orderBy(desc(financialTransactions.createdAt))
		.limit(200);
	const settlements = await tx
		.select()
		.from(payoutSettlements)
		.where(eq(payoutSettlements.masterUserId, masterUserId))
		.orderBy(desc(payoutSettlements.settledAt));

	let wages = 0;
	let finesDeducted = 0;
	let settled = 0;
	for (const t of txns) {
		const n = Number(t.amount);
		if (t.type === "WAGE_CREDIT") wages += n;
		else if (t.type === "FINE") finesDeducted += -n;
		else if (t.type === "PAYOUT_SETTLEMENT") settled += -n;
	}
	return {
		masterUserId,
		balance: bal?.balance ?? "0.00",
		wagesCredited: num(wages),
		finesDeducted: num(finesDeducted),
		payoutsSettled: num(settled),
		transactions: txns,
		settlements,
	};
}

/**
 * Pre-flight check: are all MASTER sub-stages on this property ACCEPTED?
 * Mirrors the gate maybeAdvancePropertyOnAccept uses to flip COMPLETED.
 */
export async function allMasterStagesAccepted(tx: Tx, propertyId: string): Promise<boolean> {
	const [r] = (await tx
		.select({
			total: dsql<number>`count(*) filter (where ${subStageInstances.performerType} = 'MASTER')::int`,
			done: dsql<number>`count(*) filter (where ${subStageInstances.performerType} = 'MASTER' and ${subStageInstances.status} = 'ACCEPTED')::int`,
		})
		.from(subStageInstances)
		.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
		.where(eq(stageInstances.propertyId, propertyId))) as Array<{ total: number; done: number }>;
	return !!r && r.total > 0 && r.total === r.done;
}

/**
 * Validate that each provided asset id refers to a PORTFOLIO_PHOTO asset on
 * this property. Returns the matched rows. Used by the close handler before
 * linking them via the `portfolio_assets` table.
 */
export async function validatePortfolioAssets(
	tx: Tx,
	propertyId: string,
	assetIds: string[],
): Promise<(typeof propertyAssets.$inferSelect)[]> {
	if (assetIds.length === 0) return [];
	const rows = await tx
		.select()
		.from(propertyAssets)
		.where(
			and(
				inArray(propertyAssets.id, assetIds),
				eq(propertyAssets.propertyId, propertyId),
				eq(propertyAssets.kind, "PORTFOLIO_PHOTO"),
			),
		);
	if (rows.length !== assetIds.length) {
		throw new Error("one or more portfolio asset ids invalid");
	}
	return rows;
}

/**
 * Defect summary for a property: counts rejections per sub-stage. Used in the
 * closing report. Rating recomputation is already handled by the acceptance
 * service; closing only displays the aggregate.
 */
export async function buildDefectSummary(
	tx: Tx,
	propertyId: string,
): Promise<Array<{ subStageName: string; rejectionCount: number }>> {
	const rows = (await tx.execute(
		dsql`SELECT ssi.name AS sub_stage_name, count(r.id)::int AS rejection_count
			FROM rejections r
			JOIN acceptance_requests ar ON ar.id = r.acceptance_request_id
			JOIN sub_stage_instances ssi ON ssi.id = ar.sub_stage_instance_id
			JOIN stage_instances si ON si.id = ssi.stage_instance_id
			WHERE si.property_id = ${propertyId}
			GROUP BY ssi.name
			ORDER BY rejection_count DESC, sub_stage_name ASC`,
	)) as Array<{ sub_stage_name: string; rejection_count: number }>;
	return rows.map((r) => ({
		subStageName: r.sub_stage_name,
		rejectionCount: Number(r.rejection_count),
	}));
}

export async function linkPortfolioAssets(
	tx: Tx,
	propertyId: string,
	assets: Array<{ id: string }>,
	uploadedBy: string,
): Promise<void> {
	if (assets.length === 0) return;
	await tx
		.insert(portfolioAssets)
		.values(assets.map((a) => ({ propertyId, assetId: a.id, uploadedBy })))
		.onConflictDoNothing({ target: [portfolioAssets.propertyId, portfolioAssets.assetId] });
}

/**
 * Persist a unit closing record. Caller has already validated preconditions,
 * generated PDFs, and uploaded handover/final-report assets — this function
 * just records the row and transitions the property to ARCHIVED.
 *
 * Snapshot captures the Plan-vs-Actual numbers at close time so future cost
 * edits (or reversals) on a closed property can't retroactively alter the
 * report. Idempotent only via the unique (property_id) constraint.
 */
export async function persistClosing(
	tx: Tx,
	args: {
		propertyId: string;
		closedBy: string;
		input: CloseUnitInput;
		summary: PropertyFinanceSummary;
		defectSummary: Array<{ subStageName: string; rejectionCount: number }>;
		certificateAssetId: string | null;
		finalReportAssetId: string | null;
	},
): Promise<{ id: string }> {
	const snapshot = { summary: args.summary, defects: args.defectSummary };
	const [row] = await tx
		.insert(unitClosings)
		.values({
			propertyId: args.propertyId,
			closedBy: args.closedBy,
			materialsHandoverChecked: args.input.materialsHandoverChecked,
			clientHandoverChecked: args.input.clientHandoverChecked,
			notes: args.input.notes ?? null,
			netProfit: args.summary.netProfit,
			reportSnapshot: snapshot,
			certificateAssetId: args.certificateAssetId,
			finalReportAssetId: args.finalReportAssetId,
		})
		.returning({ id: unitClosings.id });
	if (!row) throw new Error("failed to persist closing");
	await tx
		.update(properties)
		.set({ status: "ARCHIVED", updatedAt: new Date() })
		.where(eq(properties.id, args.propertyId));
	return { id: row.id };
}

/**
 * Reopen a closed/archived property. Sets status back to COMPLETED and stamps
 * the closing row with the reopen audit trail. The closing row is preserved
 * for history; the next close will fail until this row is removed or the
 * unique constraint loosens.
 */
export async function reopenClosing(
	tx: Tx,
	args: { propertyId: string; reopenedBy: string },
): Promise<boolean> {
	// Pick the active (non-reopened) closing. Past reopened rows stay as audit
	// history; the partial unique index guarantees at most one active row.
	const [closing] = await tx
		.select({ id: unitClosings.id, reopenedAt: unitClosings.reopenedAt })
		.from(unitClosings)
		.where(and(eq(unitClosings.propertyId, args.propertyId), isNull(unitClosings.reopenedAt)))
		.limit(1);
	if (!closing) return false;
	// Stamp the audit fields — this also frees the partial unique index so a
	// future close can insert a fresh row without dropping this one.
	await tx
		.update(unitClosings)
		.set({ reopenedAt: new Date(), reopenedBy: args.reopenedBy })
		.where(eq(unitClosings.id, closing.id));
	await tx
		.update(properties)
		.set({ status: "COMPLETED", updatedAt: new Date() })
		.where(eq(properties.id, args.propertyId));
	return true;
}

export async function listPropertyCosts(tx: Tx, propertyId: string) {
	return await tx
		.select()
		.from(propertyCosts)
		.where(eq(propertyCosts.propertyId, propertyId))
		.orderBy(desc(propertyCosts.incurredAt));
}

export async function listPropertyFines(tx: Tx, propertyId: string) {
	return await tx.select().from(fines).where(eq(fines.propertyId, propertyId));
}

export async function getRejectionContext(
	tx: Tx,
	rejectionId: string,
): Promise<{ masterUserId: string; propertyId: string } | null> {
	const rows = (await tx.execute(
		dsql`SELECT ar.submitted_by AS master_user_id, si.property_id AS property_id
			FROM rejections r
			JOIN acceptance_requests ar ON ar.id = r.acceptance_request_id
			JOIN sub_stage_instances ssi ON ssi.id = ar.sub_stage_instance_id
			JOIN stage_instances si ON si.id = ssi.stage_instance_id
			WHERE r.id = ${rejectionId}
			LIMIT 1`,
	)) as Array<{ master_user_id: string; property_id: string }>;
	const r = rows[0];
	return r ? { masterUserId: r.master_user_id, propertyId: r.property_id } : null;
}

/** Used by master /finance: load the master profile for current session. */
export async function findMasterProfileByUserId(tx: Tx, userId: string) {
	const [row] = await tx
		.select()
		.from(masterProfiles)
		.where(eq(masterProfiles.userId, userId))
		.limit(1);
	return row ?? null;
}
