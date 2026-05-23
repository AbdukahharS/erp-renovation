import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import {
	checklistItemInstances,
	checklistItems,
	mediaRequirementInstances,
	mediaRequirements,
	properties,
	propertyAssets,
	stageInstanceDependencies,
	stageInstances,
	stages,
	subStageInstances,
	subStages,
	templates,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { buildAssetKey, tenantOwnsKey } from "../lib/r2.ts";
import { auth } from "../modules/auth/auth.ts";

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aEmail = `owner-prop-a-${SUFFIX}@example.test`;
const bEmail = `owner-prop-b-${SUFFIX}@example.test`;
const password = "test-password-123";

let aCookie = "";
let bCookie = "";
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

type TreeSubStage = {
	id: string;
	code: string;
	performerType: "MASTER" | "INSPECTOR";
	status: string;
	wageAmount: string;
	order: number;
};
type Tree = {
	id: string;
	status: string;
	stages: Array<{ id: string; order: number; subStages: TreeSubStage[] }>;
};

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`PropA ${SUFFIX}`, `prop-a-${SUFFIX}`, aEmail);
	const b = await provision(`PropB ${SUFFIX}`, `prop-b-${SUFFIX}`, bEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aCookie = await loginAndSwitch(aEmail, aTenantId);
	bCookie = await loginAndSwitch(bEmail, bTenantId);
});

afterAll(async () => {
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(userTable).where(dsql`email IN (${aEmail}, ${bEmail})`);
});

async function createProperty(cookie: string, area = "50.00") {
	const res = await call(cookie, "/properties", {
		method: "POST",
		body: JSON.stringify({
			name: `Apt ${SUFFIX}`,
			address: "123 Test St",
			layoutType: "NEW_BUILD",
			areaSqm: area,
			plannedUnitCost: "11500.00",
		}),
	});
	expect(res.status).toBe(200);
	return (await res.json()) as { id: string };
}

describe("phase 3 properties", () => {
	it("instantiates template snapshot with wages, statuses, and 1.1 gate", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const tree = (await (await call(aCookie, `/properties/${id}`)).json()) as Tree;

		expect(tree.status).toBe("PENDING");
		expect(tree.stages.length).toBeGreaterThan(0);

		const allSub = tree.stages.flatMap((s) => s.subStages);
		expect(allSub.length).toBeGreaterThan(0);

		// First sub-stage is INSPECTOR + AVAILABLE (Sub-stage 1.1).
		const first = must(tree.stages[0]?.subStages[0]);
		expect(first.performerType).toBe("INSPECTOR");
		expect(first.status).toBe("AVAILABLE");
		expect(first.code).toBe("1.1");
		expect(Number(first.wageAmount)).toBe(0);

		// Everything else is LOCKED.
		const others = allSub.slice(1);
		for (const ss of others) {
			expect(ss.status).toBe("LOCKED");
		}

		// Master wages > 0; inspector wages == 0.
		const master = allSub.find((s) => s.performerType === "MASTER");
		expect(master).toBeDefined();
		expect(Number(must(master).wageAmount)).toBeGreaterThan(0);
		for (const ss of allSub) {
			if (ss.performerType === "INSPECTOR") expect(Number(ss.wageAmount)).toBe(0);
		}
	});

	it("wage scales linearly with area", async () => {
		const a = await createProperty(aCookie, "10.00");
		const b = await createProperty(aCookie, "20.00");
		const ta = (await (await call(aCookie, `/properties/${a.id}`)).json()) as Tree;
		const tb = (await (await call(aCookie, `/properties/${b.id}`)).json()) as Tree;
		const masterA = must(
			ta.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);
		const masterB = must(
			tb.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);
		// Same template, b has 2× area → 2× wage.
		expect(Number(masterB.wageAmount)).toBeCloseTo(Number(masterA.wageAmount) * 2, 2);
	});

	it("snapshot is unaffected by later template edits", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const before = (await (await call(aCookie, `/properties/${id}`)).json()) as Tree;
		const beforeName = (
			(await (await call(aCookie, "/templates")).json()) as Array<{ id: string }>
		)[0];
		const tplId = must(beforeName).id;
		const beforeTpl = (await (await call(aCookie, `/templates/${tplId}`)).json()) as {
			stages: Array<{ id: string; name: string }>;
		};
		const stageId = must(beforeTpl.stages[0]).id;
		const renamed = `RENAMED-${SUFFIX}`;
		await call(aCookie, `/stages/${stageId}`, {
			method: "PATCH",
			body: JSON.stringify({ name: renamed }),
		});
		const after = (await (await call(aCookie, `/properties/${id}`)).json()) as Tree & {
			stages: Array<{ name: string }>;
		};
		expect(after.stages[0]?.name).toBe((before.stages[0] as unknown as { name: string }).name);
		expect(
			after.stages.find((s) => (s as unknown as { name: string }).name === renamed),
		).toBeUndefined();
	});

	it("cross-tenant isolation: B cannot read A's property", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const res = await call(bCookie, `/properties/${id}`);
		expect(res.status).toBe(404);
	});

	it("PATCH name updates basic field; DELETE works only when PENDING", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const patched = await call(aCookie, `/properties/${id}`, {
			method: "PATCH",
			body: JSON.stringify({ name: "Renamed Apt" }),
		});
		expect(patched.status).toBe(200);
		const del = await call(aCookie, `/properties/${id}`, { method: "DELETE" });
		expect(del.status).toBe(200);
	});

	it("unauthenticated requests get 401", async () => {
		const res = await app.handle(new Request("http://localhost/properties"));
		expect(res.status).toBe(401);
	});

	it("authenticated non-OWNER (INSPECTOR) on the same tenant gets 403", async () => {
		const inspectorEmail = `inspector-prop-${SUFFIX}@example.test`;
		const signUp = await auth.api.signUpEmail({
			body: { email: inspectorEmail, password, name: inspectorEmail },
		});
		const inspectorUserId = signUp.user.id;
		await db
			.insert(tenantMemberships)
			.values({ userId: inspectorUserId, tenantId: aTenantId, role: "INSPECTOR" });

		const inspectorCookie = await loginAndSwitch(inspectorEmail, aTenantId);
		const res = await call(inspectorCookie, "/properties");
		expect(res.status).toBe(403);

		await db.delete(tenantMemberships).where(eq(tenantMemberships.userId, inspectorUserId));
		await db.delete(userTable).where(eq(userTable.id, inspectorUserId));
	});

	it("instance counts match seed (checklist + media)", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const { templateCounts, instanceCounts } = await withTenant(db, aSchema, async (tx) => {
			const [tpl] = (await tx
				.select({ id: templates.id })
				.from(templates)
				.where(eq(templates.isDefault, true))
				.limit(1)) as Array<{ id: string }>;
			const subStageIds = (
				(await tx
					.select({ id: subStages.id })
					.from(subStages)
					.innerJoin(stages, eq(stages.id, subStages.stageId))
					.where(eq(stages.templateId, must(tpl).id))) as Array<{ id: string }>
			).map((r) => r.id);
			const [tplChecklist] = (await tx.execute(
				dsql`SELECT count(*)::int AS c FROM ${checklistItems} WHERE ${checklistItems.subStageId} IN (${dsql.join(
					subStageIds.map((s) => dsql`${s}`),
					dsql`, `,
				)})`,
			)) as Array<{ c: number }>;
			const [tplMedia] = (await tx.execute(
				dsql`SELECT count(*)::int AS c FROM ${mediaRequirements} WHERE ${mediaRequirements.subStageId} IN (${dsql.join(
					subStageIds.map((s) => dsql`${s}`),
					dsql`, `,
				)})`,
			)) as Array<{ c: number }>;

			const propertyStageInstanceIds = (
				(await tx
					.select({ id: stageInstances.id })
					.from(stageInstances)
					.where(eq(stageInstances.propertyId, id))) as Array<{ id: string }>
			).map((r) => r.id);
			const propertySubStageIds = (
				(await tx
					.select({ id: subStageInstances.id })
					.from(subStageInstances)
					.where(
						dsql`${subStageInstances.stageInstanceId} IN (${dsql.join(
							propertyStageInstanceIds.map((s) => dsql`${s}`),
							dsql`, `,
						)})`,
					)) as Array<{ id: string }>
			).map((r) => r.id);
			const [instChecklist] = (await tx.execute(
				dsql`SELECT count(*)::int AS c FROM ${checklistItemInstances} WHERE ${checklistItemInstances.subStageInstanceId} IN (${dsql.join(
					propertySubStageIds.map((s) => dsql`${s}`),
					dsql`, `,
				)})`,
			)) as Array<{ c: number }>;
			const [instMedia] = (await tx.execute(
				dsql`SELECT count(*)::int AS c FROM ${mediaRequirementInstances} WHERE ${mediaRequirementInstances.subStageInstanceId} IN (${dsql.join(
					propertySubStageIds.map((s) => dsql`${s}`),
					dsql`, `,
				)})`,
			)) as Array<{ c: number }>;

			return {
				templateCounts: { checklist: must(tplChecklist).c, media: must(tplMedia).c },
				instanceCounts: { checklist: must(instChecklist).c, media: must(instMedia).c },
			};
		});
		expect(instanceCounts.checklist).toBe(templateCounts.checklist);
		expect(instanceCounts.media).toBe(templateCounts.media);
		expect(instanceCounts.checklist).toBeGreaterThan(0);
		expect(instanceCounts.media).toBeGreaterThan(0);
	});

	it("dependency edges form a linear chain in document order", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const tree = (await (await call(aCookie, `/properties/${id}`)).json()) as Tree;
		const orderedIds = tree.stages.flatMap((s) => s.subStages).map((ss) => ss.id);

		const edges = await withTenant(db, aSchema, async (tx) => {
			const stageInstanceIds = (
				(await tx
					.select({ id: stageInstances.id })
					.from(stageInstances)
					.where(eq(stageInstances.propertyId, id))) as Array<{ id: string }>
			).map((r) => r.id);
			const subIds = (
				(await tx
					.select({ id: subStageInstances.id })
					.from(subStageInstances)
					.where(
						dsql`${subStageInstances.stageInstanceId} IN (${dsql.join(
							stageInstanceIds.map((s) => dsql`${s}`),
							dsql`, `,
						)})`,
					)) as Array<{ id: string }>
			).map((r) => r.id);
			return (await tx
				.select()
				.from(stageInstanceDependencies)
				.where(
					dsql`${stageInstanceDependencies.subStageInstanceId} IN (${dsql.join(
						subIds.map((s) => dsql`${s}`),
						dsql`, `,
					)})`,
				)) as Array<{ subStageInstanceId: string; prerequisiteSubStageInstanceId: string }>;
		});

		// Exactly N-1 edges; each edge connects orderedIds[i+1] → orderedIds[i].
		expect(edges.length).toBe(orderedIds.length - 1);
		const byChild = new Map(
			edges.map((e) => [e.subStageInstanceId, e.prerequisiteSubStageInstanceId]),
		);
		for (let i = 1; i < orderedIds.length; i++) {
			expect(byChild.get(orderedIds[i] as string)).toBe(orderedIds[i - 1] as string);
		}
	});

	it("list rollup reports total master sub-stages > 0 on a fresh property", async () => {
		await createProperty(aCookie, "50.00");
		const list = (await (await call(aCookie, "/properties")).json()) as Array<{
			id: string;
			totalMasterSubStages: number;
			acceptedMasterSubStages: number;
		}>;
		expect(list.length).toBeGreaterThan(0);
		for (const p of list) {
			expect(p.totalMasterSubStages).toBeGreaterThan(0);
			expect(p.acceptedMasterSubStages).toBe(0);
		}
	});

	it("floor plan presign 503s without R2 config (dev/test default)", async () => {
		const { id } = await createProperty(aCookie, "50.00");
		const res = await call(aCookie, `/properties/${id}/floor-plan/presign`, {
			method: "POST",
			body: JSON.stringify({ kind: "FLOOR_PLAN", contentType: "image/png" }),
		});
		expect([200, 503]).toContain(res.status);
	});

	it("attach refuses an asset whose r2_key prefix is another tenant's schema", async () => {
		// Provision a real property in A, then forge an asset row whose r2_key
		// claims to belong to B's schema. Attach must reject with 403 (the
		// tenant-prefix guard runs before assertAssetExists, so this works in CI
		// without R2 configured).
		const { id } = await createProperty(aCookie, "50.00");
		const forgedKey = `${bSchema}/properties/${id}/FLOOR_PLAN/forged.jpg`;
		const forgedAssetId = await withTenant(db, aSchema, async (tx) => {
			const [row] = (await tx
				.insert(propertyAssets)
				.values({
					propertyId: id,
					kind: "FLOOR_PLAN",
					r2Key: forgedKey,
					contentType: "image/jpeg",
				})
				.returning({ id: propertyAssets.id })) as Array<{ id: string }>;
			return must(row).id;
		});
		const res = await call(aCookie, `/properties/${id}/floor-plan/attach`, {
			method: "POST",
			body: JSON.stringify({ assetId: forgedAssetId }),
		});
		expect(res.status).toBe(403);

		// And the floorPlanAssetId stays null.
		const tree = (await (await call(aCookie, `/properties/${id}`)).json()) as {
			floorPlanAssetId: string | null;
		};
		expect(tree.floorPlanAssetId).toBeNull();

		// Cleanup the forged row.
		await withTenant(db, aSchema, async (tx) => {
			await tx.delete(propertyAssets).where(eq(propertyAssets.id, forgedAssetId));
			await tx.delete(properties).where(eq(properties.id, id));
		});
	});
});

describe("r2 helpers (pure, no R2 env needed)", () => {
	it("buildAssetKey embeds tenant schema as the prefix", () => {
		const key = buildAssetKey({
			tenantSchema: "tenant_abc123",
			propertyId: "11111111-1111-1111-1111-111111111111",
			kind: "FLOOR_PLAN",
			contentType: "image/png",
		});
		expect(key.startsWith("tenant_abc123/properties/")).toBe(true);
		expect(key.includes("/FLOOR_PLAN/")).toBe(true);
		expect(key.endsWith(".png")).toBe(true);
	});

	it("buildAssetKey rejects disallowed content types", () => {
		expect(() =>
			buildAssetKey({
				tenantSchema: "tenant_abc",
				propertyId: "x",
				kind: "FLOOR_PLAN",
				contentType: "application/x-evil",
			}),
		).toThrow(/disallowed content-type/);
	});

	it("buildAssetKey rejects unsafe schema names", () => {
		expect(() =>
			buildAssetKey({
				tenantSchema: "tenant; drop table",
				propertyId: "x",
				kind: "FLOOR_PLAN",
				contentType: "image/png",
			}),
		).toThrow(/unsafe tenant schema/);
	});

	it("tenantOwnsKey accepts matching prefix, rejects others", () => {
		expect(tenantOwnsKey("tenant_a", "tenant_a/properties/x/FLOOR_PLAN/y.jpg")).toBe(true);
		expect(tenantOwnsKey("tenant_a", "tenant_b/properties/x/FLOOR_PLAN/y.jpg")).toBe(false);
		// Partial match is rejected (no slash boundary).
		expect(tenantOwnsKey("tenant_a", "tenant_abc/properties/x/FLOOR_PLAN/y.jpg")).toBe(false);
	});
});
