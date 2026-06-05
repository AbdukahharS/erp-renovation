import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenants, user as userTable } from "@repo/db/schema/control";
import { materialIssuances, materialMovements, materials } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `owner-wh-a-${SUFFIX}@example.test`;
const bOwnerEmail = `owner-wh-b-${SUFFIX}@example.test`;
const password = "test-password-123";

let aOwnerCookie = "";
let bOwnerCookie = "";
let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";

async function provision(name: string, slug: string, email: string) {
	const res = await app.handle(
		new Request("http://localhost/tenants", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-bootstrap-token": process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap",
			},
			body: JSON.stringify({
				name,
				slug,
				ownerEmail: email,
				ownerName: email,
				ownerPassword: password,
			}),
		}),
	);
	if (res.status !== 200) throw new Error(`provision failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as { tenantId: string; schemaName: string };
}

async function loginAndSwitch(email: string, tid: string): Promise<string> {
	const r = await app.handle(
		new Request("http://localhost/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password }),
		}),
	);
	const c = (r.headers.get("set-cookie") ?? "")
		.split(",")
		.map((x) => x.split(";")[0])
		.join("; ");
	const sw = await app.handle(
		new Request("http://localhost/auth/switch-tenant", {
			method: "POST",
			headers: { "content-type": "application/json", cookie: c },
			body: JSON.stringify({ tenantId: tid }),
		}),
	);
	expect(sw.status).toBe(200);
	return c;
}

async function call(cookie: string, path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookie);
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
	return await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
}

async function resolveOrCreateTemplate(
	cookie: string,
	list: Array<{ id: string; isDefault: boolean }>,
): Promise<string> {
	const existing = list.find((t) => t.isDefault) ?? list[0];
	if (existing) return existing.id;
	const created = (await (
		await call(cookie, "/templates", {
			method: "POST",
			body: JSON.stringify({
				name: "Standard Apartment Renovation",
				source: { type: "erp-default", locale: "en" },
			}),
		})
	).json()) as { id: string };
	await call(cookie, `/templates/${created.id}`, {
		method: "PATCH",
		body: JSON.stringify({ isDefault: true }),
	});
	return created.id;
}

async function createProperty(cookie: string): Promise<string> {
	const list = (await (await call(cookie, "/templates")).json()) as Array<{
		id: string;
		isDefault: boolean;
	}>;
	const templateId = await resolveOrCreateTemplate(cookie, list);
	const res = await call(cookie, "/properties", {
		method: "POST",
		body: JSON.stringify({
			name: `Apt ${SUFFIX}`,
			address: "1 Warehouse Way",
			layoutType: "NEW_BUILD",
			areaSqm: "10.00",
			plannedUnitCost: "100.00",
			templateId,
		}),
	});
	expect(res.status).toBe(200);
	const { id } = (await res.json()) as { id: string };
	return id;
}

async function createMaterial(
	cookie: string,
	body: {
		name: string;
		unit: string;
		price: string;
		folderId?: string | null;
		initialQuantity?: string;
	},
): Promise<string> {
	const res = await call(cookie, "/owner/warehouse/materials", {
		method: "POST",
		body: JSON.stringify(body),
	});
	expect(res.status).toBe(200);
	const { id } = (await res.json()) as { id: string };
	return id;
}

async function listMaterials(cookie: string) {
	const res = await call(cookie, "/owner/warehouse/materials");
	expect(res.status).toBe(200);
	return (await res.json()) as Array<{
		id: string;
		name: string;
		unit: string;
		price: string;
		onHand: string;
	}>;
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`WhA ${SUFFIX}`, `wh-a-${SUFFIX}`, aOwnerEmail);
	const b = await provision(`WhB ${SUFFIX}`, `wh-b-${SUFFIX}`, bOwnerEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aOwnerCookie = await loginAndSwitch(aOwnerEmail, aTenantId);
	bOwnerCookie = await loginAndSwitch(bOwnerEmail, bTenantId);
});

afterAll(async () => {
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(userTable).where(dsql`email IN (${aOwnerEmail}, ${bOwnerEmail})`);
});

describe("warehouse — materials CRUD + stock", () => {
	it("creates a material with opening balance recorded as RECEIPT", async () => {
		const id = await createMaterial(aOwnerCookie, {
			name: `Tile ${SUFFIX}`,
			unit: "m2",
			price: "10.00",
			initialQuantity: "5",
		});
		const list = await listMaterials(aOwnerCookie);
		const row = must(list.find((m) => m.id === id));
		expect(Number(row.onHand)).toBeCloseTo(5, 3);

		// Exactly one RECEIPT movement, no others.
		const movements = await withTenant(db, aSchema, async (tx) => {
			return await tx.select().from(materialMovements).where(eq(materialMovements.materialId, id));
		});
		expect(movements).toHaveLength(1);
		expect(movements[0]?.type).toBe("RECEIPT");
		expect(Number(movements[0]?.delta)).toBeCloseTo(5, 3);
	});

	it("restocks with optional new unit price", async () => {
		const id = await createMaterial(aOwnerCookie, {
			name: `Cable ${SUFFIX}`,
			unit: "m",
			price: "2.00",
		});
		const res = await call(aOwnerCookie, `/owner/warehouse/materials/${id}/restock`, {
			method: "POST",
			body: JSON.stringify({ quantity: "20", unitPrice: "2.50" }),
		});
		expect(res.status).toBe(200);
		const list = await listMaterials(aOwnerCookie);
		const row = must(list.find((m) => m.id === id));
		expect(Number(row.onHand)).toBeCloseTo(20, 3);
		expect(Number(row.price)).toBeCloseTo(2.5, 2);
	});

	it("adjustment with negative delta exceeding on-hand is rejected", async () => {
		const id = await createMaterial(aOwnerCookie, {
			name: `Paint ${SUFFIX}`,
			unit: "l",
			price: "5.00",
			initialQuantity: "3",
		});
		const res = await call(aOwnerCookie, `/owner/warehouse/materials/${id}/adjust`, {
			method: "POST",
			body: JSON.stringify({ delta: "-5", reason: "spill" }),
		});
		expect(res.status).toBe(409);
	});
});

describe("warehouse — issuance flow", () => {
	it("issuing materials decrements stock and writes a MATERIAL_COST transaction", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const id = await createMaterial(aOwnerCookie, {
			name: `Grout ${SUFFIX}`,
			unit: "kg",
			price: "4.00",
			initialQuantity: "10",
		});
		const res = await call(aOwnerCookie, "/owner/warehouse/issuances", {
			method: "POST",
			body: JSON.stringify({
				propertyId,
				lines: [{ materialId: id, quantity: "3.5" }],
			}),
		});
		expect(res.status).toBe(200);
		const { issued } = (await res.json()) as {
			issued: Array<{ issuanceId: string; materialId: string; amount: string }>;
		};
		expect(issued).toHaveLength(1);
		expect(Number(must(issued[0]).amount)).toBeCloseTo(14, 2);

		const list = await listMaterials(aOwnerCookie);
		expect(Number(must(list.find((m) => m.id === id)).onHand)).toBeCloseTo(6.5, 3);

		// Finance summary picks up the materials cost.
		const sum = (await (
			await call(aOwnerCookie, `/owner/properties/${propertyId}/finance`)
		).json()) as {
			summary: { materialsCost: string; costsTotal: string };
		};
		expect(Number(sum.summary.materialsCost)).toBeCloseTo(14, 2);
	});

	it("rejects issuance exceeding on-hand with INSUFFICIENT_STOCK and rolls back", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const id = await createMaterial(aOwnerCookie, {
			name: `Nails ${SUFFIX}`,
			unit: "kg",
			price: "1.00",
			initialQuantity: "2",
		});
		const res = await call(aOwnerCookie, "/owner/warehouse/issuances", {
			method: "POST",
			body: JSON.stringify({
				propertyId,
				lines: [{ materialId: id, quantity: "5" }],
			}),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; materialId: string };
		expect(body.error).toBe("INSUFFICIENT_STOCK");
		expect(body.materialId).toBe(id);

		// No issuance, no transaction, no movement (beyond opening RECEIPT) was written.
		await withTenant(db, aSchema, async (tx) => {
			const iss = await tx
				.select()
				.from(materialIssuances)
				.where(eq(materialIssuances.materialId, id));
			expect(iss).toHaveLength(0);
			const mv = await tx
				.select()
				.from(materialMovements)
				.where(eq(materialMovements.materialId, id));
			expect(mv).toHaveLength(1); // opening RECEIPT only
		});
	});

	it("reversing an issuance restocks the material and writes a REVERSAL", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const id = await createMaterial(aOwnerCookie, {
			name: `Pipe ${SUFFIX}`,
			unit: "m",
			price: "3.00",
			initialQuantity: "5",
		});
		const issue = await call(aOwnerCookie, "/owner/warehouse/issuances", {
			method: "POST",
			body: JSON.stringify({
				propertyId,
				lines: [{ materialId: id, quantity: "2" }],
			}),
		});
		expect(issue.status).toBe(200);
		const { issued } = (await issue.json()) as {
			issued: Array<{ issuanceId: string }>;
		};
		const issuanceId = must(issued[0]).issuanceId;

		const rev = await call(aOwnerCookie, `/owner/warehouse/issuances/${issuanceId}/reverse`, {
			method: "POST",
		});
		expect(rev.status).toBe(200);

		// Stock restored to 5.
		const list = await listMaterials(aOwnerCookie);
		expect(Number(must(list.find((m) => m.id === id)).onHand)).toBeCloseTo(5, 3);

		// Materials cost on the property nets to zero (cost + reversal).
		const sum = (await (
			await call(aOwnerCookie, `/owner/properties/${propertyId}/finance`)
		).json()) as {
			summary: { materialsCost: string; costsTotal: string };
		};
		// REVERSAL transactions are separate from MATERIAL_COST in the type
		// breakdown — so materialsCost stays as the original gross amount,
		// but it's offset by the REVERSAL which lands in costsTotal.
		expect(Number(sum.summary.costsTotal)).toBeCloseTo(0, 2);

		// Second reverse is a 409.
		const rev2 = await call(aOwnerCookie, `/owner/warehouse/issuances/${issuanceId}/reverse`, {
			method: "POST",
		});
		expect(rev2.status).toBe(409);
	});

	it("editing material price does not retroactively change historical issuance amounts", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const id = await createMaterial(aOwnerCookie, {
			name: `Wire ${SUFFIX}`,
			unit: "m",
			price: "1.00",
			initialQuantity: "10",
		});
		const issue = await call(aOwnerCookie, "/owner/warehouse/issuances", {
			method: "POST",
			body: JSON.stringify({
				propertyId,
				lines: [{ materialId: id, quantity: "4" }],
			}),
		});
		expect(issue.status).toBe(200);

		// Bump price.
		await call(aOwnerCookie, `/owner/warehouse/materials/${id}`, {
			method: "PATCH",
			body: JSON.stringify({ price: "99.00" }),
		});

		// Historical issuance amount remains $4 (1.00 × 4), not $396.
		const issuances = await withTenant(db, aSchema, async (tx) => {
			return await tx.select().from(materialIssuances).where(eq(materialIssuances.materialId, id));
		});
		expect(issuances).toHaveLength(1);
		expect(Number(must(issuances[0]).amount)).toBeCloseTo(4, 2);
		expect(Number(must(issuances[0]).unitPriceSnapshot)).toBeCloseTo(1, 2);
	});

	it("archiving a material with non-zero on-hand is rejected", async () => {
		const id = await createMaterial(aOwnerCookie, {
			name: `Foam ${SUFFIX}`,
			unit: "l",
			price: "1.00",
			initialQuantity: "1",
		});
		const res = await call(aOwnerCookie, `/owner/warehouse/materials/${id}`, {
			method: "DELETE",
		});
		expect(res.status).toBe(409);
	});
});

describe("warehouse — tenant isolation", () => {
	it("tenant A cannot read tenant B's materials", async () => {
		// Create a material in tenant A.
		await createMaterial(aOwnerCookie, {
			name: `IsoA ${SUFFIX}`,
			unit: "pcs",
			price: "1.00",
		});
		// List from tenant B should not include A's material.
		const listB = await listMaterials(bOwnerCookie);
		expect(listB.find((m) => m.name === `IsoA ${SUFFIX}`)).toBeUndefined();

		// Direct schema verification: B's schema has no `IsoA` row.
		const inB = await withTenant(db, bSchema, async (tx) => {
			const rows = await tx
				.select()
				.from(materials)
				.where(eq(materials.name, `IsoA ${SUFFIX}`));
			return rows.length;
		});
		expect(inB).toBe(0);
	});

	it("tenant A cannot issue against tenant B's property id", async () => {
		const propertyB = await createProperty(bOwnerCookie);
		const materialA = await createMaterial(aOwnerCookie, {
			name: `CrossA ${SUFFIX}`,
			unit: "pcs",
			price: "1.00",
			initialQuantity: "5",
		});
		// As tenant A, attempt to issue against tenant B's property. The property
		// does not exist in A's schema, so the API must 404.
		const res = await call(aOwnerCookie, "/owner/warehouse/issuances", {
			method: "POST",
			body: JSON.stringify({
				propertyId: propertyB,
				lines: [{ materialId: materialA, quantity: "1" }],
			}),
		});
		expect(res.status).toBe(404);
	});
});
