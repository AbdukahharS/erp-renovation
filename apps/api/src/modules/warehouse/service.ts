import {
	financialTransactions,
	materialIssuances,
	materialMovements,
	materials,
	properties,
} from "@repo/db/schema/tenant";
import type { TenantTx as Tx } from "@repo/db/with-tenant";
import type {
	AdjustMaterialInput,
	CreateMaterialInput,
	IssueMaterialsInput,
	RestockMaterialInput,
	UpdateMaterialInput,
} from "@repo/validators";
import { and, desc, sql as dsql, eq, inArray, isNull } from "drizzle-orm";

export class InsufficientStockError extends Error {
	readonly code = "INSUFFICIENT_STOCK";
	constructor(
		readonly materialId: string,
		readonly requested: string,
		readonly available: string,
	) {
		super(
			`insufficient stock for material ${materialId}: requested ${requested}, available ${available}`,
		);
		this.name = "InsufficientStockError";
	}
}

function round2(n: number): string {
	return n.toFixed(2);
}

async function onHandFor(tx: Tx, materialId: string): Promise<string> {
	const [row] = (await tx
		.select({
			total: dsql<string>`coalesce(sum(${materialMovements.delta}), 0)::text`,
		})
		.from(materialMovements)
		.where(eq(materialMovements.materialId, materialId))) as Array<{ total: string }>;
	return row?.total ?? "0";
}

export async function listMaterials(
	tx: Tx,
	opts: { includeArchived?: boolean } = {},
): Promise<
	Array<{
		id: string;
		name: string;
		category: string | null;
		unit: string;
		price: string;
		archivedAt: Date | null;
		createdAt: Date;
		updatedAt: Date;
		onHand: string;
	}>
> {
	const rows = (await tx
		.select({
			id: materials.id,
			name: materials.name,
			category: materials.category,
			unit: materials.unit,
			price: materials.price,
			archivedAt: materials.archivedAt,
			createdAt: materials.createdAt,
			updatedAt: materials.updatedAt,
			onHand: dsql<string>`coalesce((
				SELECT sum(delta) FROM material_movements WHERE material_movements.material_id = materials.id
			), 0)::text`,
		})
		.from(materials)
		.where(opts.includeArchived ? dsql`true` : isNull(materials.archivedAt))
		.orderBy(materials.name)) as Array<{
		id: string;
		name: string;
		category: string | null;
		unit: string;
		price: string;
		archivedAt: Date | null;
		createdAt: Date;
		updatedAt: Date;
		onHand: string;
	}>;
	return rows;
}

export async function getMaterial(tx: Tx, id: string) {
	const [row] = await tx.select().from(materials).where(eq(materials.id, id)).limit(1);
	if (!row) return null;
	const onHand = await onHandFor(tx, id);
	return { ...row, onHand };
}

export async function createMaterial(
	tx: Tx,
	args: { input: CreateMaterialInput; actorUserId: string },
): Promise<{ id: string }> {
	const [row] = await tx
		.insert(materials)
		.values({
			name: args.input.name,
			category: args.input.category ?? null,
			unit: args.input.unit,
			price: args.input.price,
		})
		.returning({ id: materials.id });
	if (!row) throw new Error("failed to insert material");

	if (args.input.initialQuantity && Number(args.input.initialQuantity) > 0) {
		await tx.insert(materialMovements).values({
			materialId: row.id,
			type: "RECEIPT",
			delta: args.input.initialQuantity,
			unitPriceSnapshot: args.input.price,
			actorUserId: args.actorUserId,
			// Sentinel reason for system-generated movements; the client
			// translates "system:*" via warehouse.systemReason.*.
			reason: "system:opening_balance",
		});
	}
	return { id: row.id };
}

export async function updateMaterial(
	tx: Tx,
	id: string,
	input: UpdateMaterialInput,
): Promise<boolean> {
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (input.name !== undefined) patch.name = input.name;
	if (input.category !== undefined) patch.category = input.category;
	if (input.price !== undefined) patch.price = input.price;
	const [row] = await tx
		.update(materials)
		.set(patch)
		.where(eq(materials.id, id))
		.returning({ id: materials.id });
	return !!row;
}

export async function archiveMaterial(
	tx: Tx,
	id: string,
): Promise<"ok" | "not_found" | "has_stock"> {
	const [row] = await tx
		.select({ id: materials.id })
		.from(materials)
		.where(eq(materials.id, id))
		.limit(1);
	if (!row) return "not_found";
	const onHand = Number(await onHandFor(tx, id));
	if (onHand !== 0) return "has_stock";
	await tx
		.update(materials)
		.set({ archivedAt: new Date(), updatedAt: new Date() })
		.where(eq(materials.id, id));
	return "ok";
}

export async function restockMaterial(
	tx: Tx,
	id: string,
	input: RestockMaterialInput,
	actorUserId: string,
): Promise<{ movementId: string }> {
	const [mat] = await tx
		.select({ id: materials.id, price: materials.price })
		.from(materials)
		.where(eq(materials.id, id))
		.limit(1);
	if (!mat) throw new Error("material not found");
	const unitPrice = input.unitPrice ?? mat.price;
	if (input.unitPrice && input.unitPrice !== mat.price) {
		await tx
			.update(materials)
			.set({ price: input.unitPrice, updatedAt: new Date() })
			.where(eq(materials.id, id));
	}
	const [mv] = await tx
		.insert(materialMovements)
		.values({
			materialId: id,
			type: "RECEIPT",
			delta: input.quantity,
			unitPriceSnapshot: unitPrice,
			actorUserId,
			reason: input.note ?? null,
		})
		.returning({ id: materialMovements.id });
	if (!mv) throw new Error("failed to insert receipt movement");
	return { movementId: mv.id };
}

export async function adjustMaterial(
	tx: Tx,
	id: string,
	input: AdjustMaterialInput,
	actorUserId: string,
): Promise<{ movementId: string } | { error: "would_go_negative"; available: string }> {
	const onHand = Number(await onHandFor(tx, id));
	const next = onHand + Number(input.delta);
	if (next < 0) {
		return { error: "would_go_negative", available: onHand.toString() };
	}
	const [mv] = await tx
		.insert(materialMovements)
		.values({
			materialId: id,
			type: "ADJUSTMENT",
			delta: input.delta,
			actorUserId,
			reason: input.reason,
		})
		.returning({ id: materialMovements.id });
	if (!mv) throw new Error("failed to insert adjustment movement");
	return { movementId: mv.id };
}

/**
 * Issue materials from the warehouse to a property in a single transaction.
 *
 * Concurrency: locks every involved material row (`FOR UPDATE`, ordered by id
 * to prevent deadlocks) before reading on-hand, so two parallel issuances
 * against the same material serialize correctly and stock can never go
 * negative. Throws `InsufficientStockError` on any line that exceeds on-hand
 * — the entire tx rolls back.
 *
 * For each line writes three rows in this order:
 *   1. `financial_transactions` MATERIAL_COST (amount = qty × price_snapshot)
 *   2. `material_movements` ISSUANCE (delta = -qty)
 *   3. `material_issuances` referencing both ids
 * Then back-patches the movement with the issuance id so the ledger can link
 * back to the parent issuance row.
 */
export async function issueMaterialsToProperty(
	tx: Tx,
	args: { input: IssueMaterialsInput; actorUserId: string },
): Promise<Array<{ issuanceId: string; materialId: string; amount: string }>> {
	const lines = args.input.lines;
	if (lines.length === 0) throw new Error("no lines");

	const [prop] = await tx
		.select({ id: properties.id, status: properties.status })
		.from(properties)
		.where(eq(properties.id, args.input.propertyId))
		.limit(1);
	if (!prop) throw new Error("property not found");
	if (prop.status === "ARCHIVED") throw new Error("property is archived");

	// Lock involved materials, ordered, to serialize concurrent issuances.
	const materialIds = Array.from(new Set(lines.map((l) => l.materialId))).sort();
	const locked = (await tx.execute(
		dsql`SELECT id, price FROM materials WHERE id = ANY(${dsql.param(materialIds)}::uuid[]) AND archived_at IS NULL ORDER BY id FOR UPDATE`,
	)) as Array<{ id: string; price: string }>;
	const priceMap = new Map(locked.map((r) => [r.id, r.price] as const));
	if (priceMap.size !== materialIds.length) {
		const missing = materialIds.find((id) => !priceMap.has(id));
		throw new Error(`material not found or archived: ${missing}`);
	}

	// Compute current on-hand for each locked material once we hold the lock.
	const onHandMap = new Map<string, number>();
	for (const id of materialIds) {
		onHandMap.set(id, Number(await onHandFor(tx, id)));
	}

	// Pre-flight: sum requested quantity per material (handles same-material
	// repeated lines) and reject if any exceeds on-hand.
	const requestedByMaterial = new Map<string, number>();
	for (const l of lines) {
		requestedByMaterial.set(
			l.materialId,
			(requestedByMaterial.get(l.materialId) ?? 0) + Number(l.quantity),
		);
	}
	for (const [id, req] of requestedByMaterial) {
		const avail = onHandMap.get(id) ?? 0;
		if (req > avail) {
			throw new InsufficientStockError(id, req.toString(), avail.toString());
		}
	}

	const out: Array<{ issuanceId: string; materialId: string; amount: string }> = [];
	for (const line of lines) {
		const unitPrice = priceMap.get(line.materialId);
		if (!unitPrice) throw new Error(`material not locked: ${line.materialId}`);
		const amount = round2(Number(line.quantity) * Number(unitPrice));

		const [txn] = await tx
			.insert(financialTransactions)
			.values({
				type: "MATERIAL_COST",
				propertyId: args.input.propertyId,
				amount,
				description: line.note ?? null,
			})
			.returning({ id: financialTransactions.id });
		if (!txn) throw new Error("failed to insert financial transaction");

		const negDelta = `-${line.quantity}`;
		const [mv] = await tx
			.insert(materialMovements)
			.values({
				materialId: line.materialId,
				type: "ISSUANCE",
				delta: negDelta,
				unitPriceSnapshot: unitPrice,
				actorUserId: args.actorUserId,
				reason: line.note ?? null,
			})
			.returning({ id: materialMovements.id });
		if (!mv) throw new Error("failed to insert issuance movement");

		const [iss] = await tx
			.insert(materialIssuances)
			.values({
				propertyId: args.input.propertyId,
				materialId: line.materialId,
				quantity: line.quantity,
				unitPriceSnapshot: unitPrice,
				amount,
				transactionId: txn.id,
				movementId: mv.id,
				issuedBy: args.actorUserId,
				note: line.note ?? null,
			})
			.returning({ id: materialIssuances.id });
		if (!iss) throw new Error("failed to insert issuance");

		// Back-patch movement → issuance link.
		await tx
			.update(materialMovements)
			.set({ issuanceId: iss.id })
			.where(eq(materialMovements.id, mv.id));

		out.push({ issuanceId: iss.id, materialId: line.materialId, amount });
	}

	return out;
}

export async function reverseIssuance(
	tx: Tx,
	args: { issuanceId: string; reversedBy: string },
): Promise<"ok" | "not_found" | "already_reversed" | "archived"> {
	const [iss] = await tx
		.select()
		.from(materialIssuances)
		.where(eq(materialIssuances.id, args.issuanceId))
		.limit(1);
	if (!iss) return "not_found";
	if (iss.reversedAt) return "already_reversed";

	const [prop] = await tx
		.select({ status: properties.status })
		.from(properties)
		.where(eq(properties.id, iss.propertyId))
		.limit(1);
	if (prop?.status === "ARCHIVED") return "archived";

	// Mirror reversePropertyCost: inverse REVERSAL financial transaction
	// (negative amount) + positive-delta REVERSAL movement that restores stock.
	await tx.insert(financialTransactions).values({
		type: "REVERSAL",
		propertyId: iss.propertyId,
		amount: `-${iss.amount}`,
		// Description is internal/audit (financial ledger), not user-visible in
		// the warehouse movements UI — keep the human-readable form here.
		description: `Reversal of issuance ${iss.id}`,
	});
	await tx.insert(materialMovements).values({
		materialId: iss.materialId,
		type: "REVERSAL",
		delta: iss.quantity,
		unitPriceSnapshot: iss.unitPriceSnapshot,
		issuanceId: iss.id,
		actorUserId: args.reversedBy,
		// Sentinel: the linked issuance id is already on `issuanceId`, so the
		// UI doesn't need it in the reason string. Localized client-side.
		reason: "system:reversal",
	});
	await tx
		.update(materialIssuances)
		.set({ reversedAt: new Date(), reversedBy: args.reversedBy })
		.where(eq(materialIssuances.id, iss.id));
	return "ok";
}

export async function listIssuancesByProperty(tx: Tx, propertyId: string) {
	const rows = await tx
		.select({
			id: materialIssuances.id,
			propertyId: materialIssuances.propertyId,
			materialId: materialIssuances.materialId,
			materialName: materials.name,
			materialUnit: materials.unit,
			quantity: materialIssuances.quantity,
			unitPriceSnapshot: materialIssuances.unitPriceSnapshot,
			amount: materialIssuances.amount,
			transactionId: materialIssuances.transactionId,
			movementId: materialIssuances.movementId,
			issuedBy: materialIssuances.issuedBy,
			note: materialIssuances.note,
			reversedAt: materialIssuances.reversedAt,
			reversedBy: materialIssuances.reversedBy,
			createdAt: materialIssuances.createdAt,
		})
		.from(materialIssuances)
		.innerJoin(materials, eq(materials.id, materialIssuances.materialId))
		.where(eq(materialIssuances.propertyId, propertyId))
		.orderBy(desc(materialIssuances.createdAt));
	return rows;
}

export async function listMovementsByMaterial(tx: Tx, materialId: string) {
	return await tx
		.select()
		.from(materialMovements)
		.where(eq(materialMovements.materialId, materialId))
		.orderBy(desc(materialMovements.createdAt));
}

// Used by tenant-isolation tests: returns the count of materials visible in
// the current tenant schema. The test asserts tenant A cannot see tenant B's
// materials by switching context and calling this twice.
export async function countMaterials(tx: Tx): Promise<number> {
	const [r] = (await tx.select({ n: dsql<number>`count(*)::int` }).from(materials)) as Array<{
		n: number;
	}>;
	return r?.n ?? 0;
}

// Convenience re-exports for tests/admin tools.
export { and, eq, inArray };
