import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import {
	mediaRequirementInstances,
	properties,
	propertyAssets,
	stageMediaAssets,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { and, asc, sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { auth } from "../modules/auth/auth.ts";
import { flushAcceptanceJobs } from "./job-runner.ts";

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `owner-arch-a-${SUFFIX}@example.test`;
const bOwnerEmail = `owner-arch-b-${SUFFIX}@example.test`;
const aInspectorEmail = `insp-arch-a-${SUFFIX}@example.test`;
const aMasterEmail = `mast-arch-a-${SUFFIX}@example.test`;
const password = "test-password-123";

let aOwnerCookie = "";
let bOwnerCookie = "";
let aInspectorCookie = "";
let aMasterCookie = "";
let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";
let aInspectorUserId = "";
let aMasterUserId = "";

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

async function signUpAs(email: string, role: "INSPECTOR" | "MASTER", tenantId: string) {
	const r = await auth.api.signUpEmail({ body: { email, password, name: email } });
	const userId = r.user.id;
	await db.insert(tenantMemberships).values({ userId, tenantId, role });
	return userId;
}

async function call(cookie: string, path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookie);
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
	const res = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
	await flushAcceptanceJobs();
	return res;
}

type Tree = {
	id: string;
	status: string;
	archivedAt: string | null;
	archivedBy: string | null;
	archiveReason: string | null;
	stages: Array<{
		subStages: Array<{
			id: string;
			code: string;
			performerType: "MASTER" | "INSPECTOR";
			specialization: string | null;
			status: string;
			wageAmount: string;
		}>;
	}>;
};

async function defaultTemplateId(cookie: string): Promise<string> {
	const list = (await (await call(cookie, "/templates")).json()) as Array<{
		id: string;
		isDefault: boolean;
	}>;
	const def = list.find((t) => t.isDefault) ?? list[0];
	if (def) return def.id;
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

async function createProperty(cookie: string) {
	const templateId = await defaultTemplateId(cookie);
	const res = await call(cookie, "/properties", {
		method: "POST",
		body: JSON.stringify({
			name: `Apt ${SUFFIX}`,
			address: "1 Archive Way",
			layoutType: "NEW_BUILD",
			areaSqm: "10.00",
			plannedUnitCost: "100.00",
			templateId,
		}),
	});
	expect(res.status).toBe(200);
	const { id } = (await res.json()) as { id: string };
	const tree = (await (await call(cookie, `/properties/${id}`)).json()) as Tree;
	return { id, tree };
}

async function attachInspectorBeforeAsset(
	schema: string,
	propertyId: string,
	subStageInstanceId: string,
	userId: string,
) {
	await withTenant(db, schema, async (tx) => {
		const reqs = await tx
			.select({ id: mediaRequirementInstances.id })
			.from(mediaRequirementInstances)
			.where(
				and(
					eq(mediaRequirementInstances.subStageInstanceId, subStageInstanceId),
					eq(mediaRequirementInstances.required, true),
					eq(mediaRequirementInstances.mediaType, "PHOTO"),
				),
			)
			.orderBy(asc(mediaRequirementInstances.id));
		const targets: Array<string | null> = reqs.length > 0 ? reqs.map((r) => r.id) : [null];
		for (const requirementId of targets) {
			const uid = crypto.randomUUID();
			const [asset] = await tx
				.insert(propertyAssets)
				.values({
					propertyId,
					kind: "BEFORE_PHOTO",
					r2Key: `${schema}/properties/${propertyId}/BEFORE_PHOTO/${uid}.jpg`,
					contentType: "image/jpeg",
					uploadedBy: userId,
				})
				.returning({ id: propertyAssets.id });
			await tx.insert(stageMediaAssets).values({
				subStageInstanceId,
				assetId: must(asset).id,
				requirementId,
				uploadedBy: userId,
			});
		}
	});
}

async function passInspectorStage(subStageId: string) {
	await call(aInspectorCookie, `/inspector/stages/${subStageId}/submit-self`, {
		method: "POST",
		body: JSON.stringify({}),
	});
	const det = (await (await call(aInspectorCookie, `/inspector/stages/${subStageId}`)).json()) as {
		subStage: { checklistItems: Array<{ id: string }> };
	};
	const acc = await call(aInspectorCookie, `/inspector/stages/${subStageId}/accept`, {
		method: "POST",
		body: JSON.stringify({
			results: det.subStage.checklistItems.map((i) => ({
				checklistItemInstanceId: i.id,
				passed: true,
			})),
		}),
	});
	expect(acc.status).toBe(200);
}

async function takeMasterStage(subStageId: string, specialization: string | null) {
	// Align master's specializations with the sub-stage so /master/stages/.../take
	// passes the specialization guard. Mirrors finance.test.ts driveMasterStage.
	await withTenant(db, aSchema, async (tx) => {
		await tx.execute(
			dsql`UPDATE master_profiles SET specializations = ${dsql.raw(
				specialization
					? `ARRAY['${specialization.replaceAll("'", "''")}']::text[]`
					: "ARRAY[]::text[]",
			)} WHERE user_id = ${aMasterUserId}`,
		);
	});
	const take = await call(aMasterCookie, `/master/stages/${subStageId}/take`, {
		method: "POST",
	});
	if (take.status !== 200) throw new Error(`take failed ${take.status} ${await take.text()}`);
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`ArchA ${SUFFIX}`, `arch-a-${SUFFIX}`, aOwnerEmail);
	const b = await provision(`ArchB ${SUFFIX}`, `arch-b-${SUFFIX}`, bOwnerEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aOwnerCookie = await loginAndSwitch(aOwnerEmail, aTenantId);
	bOwnerCookie = await loginAndSwitch(bOwnerEmail, bTenantId);
	aInspectorUserId = await signUpAs(aInspectorEmail, "INSPECTOR", aTenantId);
	aInspectorCookie = await loginAndSwitch(aInspectorEmail, aTenantId);
	aMasterUserId = await signUpAs(aMasterEmail, "MASTER", aTenantId);
	aMasterCookie = await loginAndSwitch(aMasterEmail, aTenantId);
	// Seed master profile so /master/stages/.../take works.
	await withTenant(db, aSchema, async (tx) => {
		await tx.execute(
			dsql`INSERT INTO master_profiles (user_id, display_name, specializations) VALUES (${aMasterUserId}, ${"Master Arch"}, ${dsql`ARRAY[]::text[]`}) ON CONFLICT (user_id) DO NOTHING`,
		);
	});
});

afterAll(async () => {
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	await db
		.delete(userTable)
		.where(dsql`email IN (${aOwnerEmail}, ${bOwnerEmail}, ${aInspectorEmail}, ${aMasterEmail})`);
});

describe("manual property archive", () => {
	it("archives a PENDING property with a reason and clears it on un-archive", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		expect(tree.status).toBe("PENDING");

		const archiveRes = await call(aOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "client cancelled" }),
		});
		expect(archiveRes.status).toBe(200);
		const archived = (await archiveRes.json()) as Tree;
		expect(archived.status).toBe("ARCHIVED");
		expect(archived.archiveReason).toBe("client cancelled");
		expect(archived.archivedAt).not.toBeNull();
		expect(archived.archivedBy).not.toBeNull();

		const unRes = await call(aOwnerCookie, `/properties/${id}/unarchive`, {
			method: "POST",
		});
		expect(unRes.status).toBe(200);
		const restored = (await unRes.json()) as Tree;
		// 1.1 not accepted yet — recompute lands back at PENDING.
		expect(restored.status).toBe("PENDING");
		expect(restored.archivedAt).toBeNull();
		expect(restored.archiveReason).toBeNull();
		expect(restored.archivedBy).toBeNull();
	});

	it("un-archives a READY_FOR_PRODUCTION property back to READY_FOR_PRODUCTION", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const inspectorSub = must(tree.stages[0]?.subStages[0]);
		await attachInspectorBeforeAsset(aSchema, id, inspectorSub.id, aInspectorUserId);
		await passInspectorStage(inspectorSub.id);

		const afterAccept = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		expect(afterAccept.status).toBe("READY_FOR_PRODUCTION");

		const archived = await call(aOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "scope change" }),
		});
		expect(archived.status).toBe(200);
		expect(((await archived.json()) as Tree).status).toBe("ARCHIVED");

		const unRes = await call(aOwnerCookie, `/properties/${id}/unarchive`, {
			method: "POST",
		});
		expect(unRes.status).toBe(200);
		expect(((await unRes.json()) as Tree).status).toBe("READY_FOR_PRODUCTION");
	});

	it("blocks archive when a master sub-stage is IN_PROGRESS, listing the blocker", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const inspectorSub = must(tree.stages[0]?.subStages[0]);
		await attachInspectorBeforeAsset(aSchema, id, inspectorSub.id, aInspectorUserId);
		await passInspectorStage(inspectorSub.id);

		// Pick any AVAILABLE master sub-stage and take it.
		const tree2 = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const master = must(
			tree2.stages
				.flatMap((s) => s.subStages)
				.find((s) => s.performerType === "MASTER" && s.status === "AVAILABLE"),
		);
		await takeMasterStage(master.id, master.specialization);

		const res = await call(aOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "abandon" }),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as {
			error: string;
			blockers: Array<{ code: string; name: string }>;
		};
		expect(body.error).toBe("active_work");
		expect(body.blockers.some((b) => b.code === master.code)).toBe(true);

		// Property still in its prior status.
		const after = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		expect(after.status).toBe("IN_PROGRESS");
	});

	it("rejects archive when status is ARCHIVED already", async () => {
		const { id } = await createProperty(aOwnerCookie);
		const first = await call(aOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "dup" }),
		});
		expect(first.status).toBe(200);
		const again = await call(aOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "dup" }),
		});
		expect(again.status).toBe(409);
	});

	it("rejects unarchive on a property that wasn't manually archived", async () => {
		const { id } = await createProperty(aOwnerCookie);
		// Force-archive via DB without setting archivedAt — simulates a
		// finance-archived row. The unarchive endpoint must refuse and steer
		// the caller to the finance reopen flow.
		await withTenant(db, aSchema, async (tx) => {
			await tx
				.update(properties)
				.set({ status: "ARCHIVED", archivedAt: null })
				.where(eq(properties.id, id));
		});
		const res = await call(aOwnerCookie, `/properties/${id}/unarchive`, { method: "POST" });
		expect(res.status).toBe(409);
	});

	it("isolates archive across tenants — tenant B cannot archive tenant A's property", async () => {
		const { id } = await createProperty(aOwnerCookie);
		const res = await call(bOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "cross-tenant" }),
		});
		// Tenant B's schema has no row with that id — 404.
		expect(res.status).toBe(404);
		const after = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		expect(after.status).toBe("PENDING");
	});

	it("warehouse issuance against an archived property fails (regression)", async () => {
		const { id } = await createProperty(aOwnerCookie);
		const arch = await call(aOwnerCookie, `/properties/${id}/archive`, {
			method: "POST",
			body: JSON.stringify({ reason: "material guard regression" }),
		});
		expect(arch.status).toBe(200);

		// Seed a material with stock so the guard fires on the archived check,
		// not on stock validation.
		const matId = await withTenant(db, aSchema, async (tx) => {
			const [m] = await tx.execute<{ id: string }>(
				dsql`INSERT INTO materials (name, unit, price) VALUES (${`Cement-${SUFFIX}`}, ${"kg"}, ${"1.00"}) RETURNING id`,
			);
			const created = must(m as unknown as { id: string });
			await tx.execute(
				dsql`INSERT INTO material_movements (material_id, type, delta, unit_price_snapshot, actor_user_id, reason) VALUES (${created.id}, ${"RECEIPT"}, ${"100"}, ${"1.00"}, ${aInspectorUserId}, ${"seed"})`,
			);
			return created.id;
		});

		const res = await call(aOwnerCookie, "/warehouse/issuances", {
			method: "POST",
			body: JSON.stringify({
				propertyId: id,
				lines: [{ materialId: matId, quantity: "1", note: null }],
			}),
		});
		expect(res.status).not.toBe(200);
	});
});
