import {
	AdjustMaterialInput,
	CreateMaterialInput,
	IssueMaterialsInput,
	RestockMaterialInput,
	UpdateMaterialInput,
} from "@repo/validators";
// Imports above are used for runtime body validation via zodBody.
import { Elysia } from "elysia";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";
import {
	adjustMaterial,
	archiveMaterial,
	createMaterial,
	getMaterial,
	InsufficientStockError,
	issueMaterialsToProperty,
	listIssuancesByProperty,
	listMaterials,
	listMovementsByMaterial,
	restockMaterial,
	reverseIssuance,
	updateMaterial,
} from "./service.ts";

const ownerRoutes = new Elysia({ prefix: "/owner" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	.get("/warehouse/materials", async ({ runInTenant, query, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const includeArchived = query.includeArchived === "true";
		return await runInTenant((tx) => listMaterials(tx, { includeArchived }));
	})

	.get("/warehouse/materials/:id", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const row = await runInTenant((tx) => getMaterial(tx, params.id));
		if (!row) {
			set.status = 404;
			return { error: "material not found" };
		}
		return row;
	})

	.post(
		"/warehouse/materials",
		async ({ body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant((tx) => createMaterial(tx, { input: body, actorUserId: user.id }));
		},
		{ body: zodBody(CreateMaterialInput) },
	)

	.patch(
		"/warehouse/materials/:id",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const ok = await runInTenant((tx) => updateMaterial(tx, params.id, body));
			if (!ok) {
				set.status = 404;
				return { error: "material not found" };
			}
			return { ok: true };
		},
		{ body: zodBody(UpdateMaterialInput) },
	)

	.delete("/warehouse/materials/:id", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const result = await runInTenant((tx) => archiveMaterial(tx, params.id));
		if (result === "not_found") {
			set.status = 404;
			return { error: "material not found" };
		}
		if (result === "has_stock") {
			set.status = 409;
			return { error: "cannot archive material with non-zero on-hand stock" };
		}
		return { ok: true };
	})

	.post(
		"/warehouse/materials/:id/restock",
		async ({ params, body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			try {
				return await runInTenant((tx) => restockMaterial(tx, params.id, body, user.id));
			} catch (err) {
				if ((err as Error).message === "material not found") {
					set.status = 404;
					return { error: "material not found" };
				}
				throw err;
			}
		},
		{ body: zodBody(RestockMaterialInput) },
	)

	.post(
		"/warehouse/materials/:id/adjust",
		async ({ params, body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const result = await runInTenant((tx) => adjustMaterial(tx, params.id, body, user.id));
			if ("error" in result) {
				set.status = 409;
				return { error: "adjustment would result in negative stock", available: result.available };
			}
			return result;
		},
		{ body: zodBody(AdjustMaterialInput) },
	)

	.get("/warehouse/materials/:id/movements", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant((tx) => listMovementsByMaterial(tx, params.id));
	})

	.post(
		"/warehouse/issuances",
		async ({ body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			try {
				const issued = await runInTenant((tx) =>
					issueMaterialsToProperty(tx, { input: body, actorUserId: user.id }),
				);
				return { issued };
			} catch (err) {
				if (err instanceof InsufficientStockError) {
					set.status = 409;
					return {
						error: "INSUFFICIENT_STOCK",
						materialId: err.materialId,
						requested: err.requested,
						available: err.available,
					};
				}
				const msg = (err as Error).message;
				if (msg === "property not found" || msg.startsWith("material not found")) {
					set.status = 404;
					return { error: msg };
				}
				if (msg === "property is archived") {
					set.status = 409;
					return { error: msg };
				}
				throw err;
			}
		},
		{ body: zodBody(IssueMaterialsInput) },
	)

	.get("/warehouse/issuances", async ({ query, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		if (!query.propertyId) {
			set.status = 400;
			return { error: "propertyId is required" };
		}
		return await runInTenant((tx) => listIssuancesByProperty(tx, query.propertyId as string));
	})

	.post("/warehouse/issuances/:id/reverse", async ({ params, user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const result = await runInTenant((tx) =>
			reverseIssuance(tx, { issuanceId: params.id, reversedBy: user.id }),
		);
		if (result === "not_found") {
			set.status = 404;
			return { error: "issuance not found" };
		}
		if (result === "already_reversed") {
			set.status = 409;
			return { error: "issuance already reversed" };
		}
		if (result === "archived") {
			set.status = 409;
			return { error: "cannot reverse issuance on archived property" };
		}
		return { ok: true };
	});

export const warehouseRoutes = new Elysia().use(ownerRoutes);
