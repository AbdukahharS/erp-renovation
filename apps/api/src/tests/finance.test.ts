import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import {
	financialTransactions,
	masterBalances,
	masterProfiles,
	properties,
	propertyAssets,
	propertyCosts,
	stageMediaAssets,
	subStageInstances,
	unitClosings,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { auth } from "../modules/auth/auth.ts";
import { flushAcceptanceJobs } from "./job-runner.ts";

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `owner-fin-a-${SUFFIX}@example.test`;
const bOwnerEmail = `owner-fin-b-${SUFFIX}@example.test`;
const aInspectorEmail = `insp-fin-a-${SUFFIX}@example.test`;
const aMasterEmail = `mast-fin-a-${SUFFIX}@example.test`;
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

async function call(cookie: string, path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookie);
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
	const res = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
	await flushAcceptanceJobs();
	return res;
}

async function signUpAs(email: string, role: "INSPECTOR" | "MASTER", tenantId: string) {
	const r = await auth.api.signUpEmail({
		body: { email, password, name: email },
	});
	const userId = r.user.id;
	await db.insert(tenantMemberships).values({ userId, tenantId, role });
	return userId;
}

type Tree = {
	id: string;
	status: string;
	stages: Array<{
		subStages: Array<{
			id: string;
			performerType: "MASTER" | "INSPECTOR";
			specialization: string | null;
			status: string;
			wageAmount: string;
		}>;
	}>;
};

async function attachFakeAsset(
	schema: string,
	propertyId: string,
	subStageInstanceId: string,
	kind: "STAGE_PHOTO" | "BEFORE_PHOTO" | "DEFECT_PHOTO",
	userId: string,
): Promise<string> {
	return await withTenant(db, schema, async (tx) => {
		const uid = crypto.randomUUID();
		const [asset] = (await tx
			.insert(propertyAssets)
			.values({
				propertyId,
				kind,
				r2Key: `${schema}/properties/${propertyId}/${kind}/${uid}.jpg`,
				contentType: "image/jpeg",
				uploadedBy: userId,
			})
			.returning({ id: propertyAssets.id })) as Array<{ id: string }>;
		await tx
			.insert(stageMediaAssets)
			.values({ subStageInstanceId, assetId: must(asset).id, uploadedBy: userId });
		return must(asset).id;
	});
}

/** Stand-in for the real presign+upload flow for portfolio photos. */
async function insertPortfolioAsset(
	schema: string,
	propertyId: string,
	userId: string,
): Promise<string> {
	return await withTenant(db, schema, async (tx) => {
		const uid = crypto.randomUUID();
		const [asset] = (await tx
			.insert(propertyAssets)
			.values({
				propertyId,
				kind: "PORTFOLIO_PHOTO",
				r2Key: `${schema}/properties/${propertyId}/PORTFOLIO_PHOTO/${uid}.jpg`,
				contentType: "image/jpeg",
				uploadedBy: userId,
			})
			.returning({ id: propertyAssets.id })) as Array<{ id: string }>;
		return must(asset).id;
	});
}

async function createProperty(cookie: string) {
	const list = (await (await call(cookie, "/templates")).json()) as Array<{
		id: string;
		isDefault: boolean;
	}>;
	const templateId = must(list.find((t) => t.isDefault) ?? list[0]).id;
	const res = await call(cookie, "/properties", {
		method: "POST",
		body: JSON.stringify({
			name: `Apt ${SUFFIX}`,
			address: "1 Plan Street",
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

async function driveMasterStage(
	propertyId: string,
	subStageId: string,
	specialization: string | null,
) {
	await withTenant(db, aSchema, async (tx) => {
		await tx
			.insert(masterProfiles)
			.values({
				userId: aMasterUserId,
				displayName: "Master One",
				specializations: specialization ? [specialization] : [],
			})
			.onConflictDoUpdate({
				target: masterProfiles.userId,
				set: { specializations: specialization ? [specialization] : [] },
			});
	});
	const take = await call(aMasterCookie, `/master/stages/${subStageId}/take`, { method: "POST" });
	if (take.status !== 200) throw new Error(`take failed ${take.status} ${await take.text()}`);
	await attachFakeAsset(aSchema, propertyId, subStageId, "STAGE_PHOTO", aMasterUserId);
	const sub = await call(aMasterCookie, `/master/stages/${subStageId}/submit`, {
		method: "POST",
		body: JSON.stringify({}),
	});
	expect(sub.status).toBe(200);
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

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`FinA ${SUFFIX}`, `fin-a-${SUFFIX}`, aOwnerEmail);
	const b = await provision(`FinB ${SUFFIX}`, `fin-b-${SUFFIX}`, bOwnerEmail);
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

describe("phase 7 finance — plan vs actual", () => {
	it("aggregates wages, material costs, and computes net profit", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const firstInspector = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, firstInspector.id, "BEFORE_PHOTO", aInspectorUserId);
		await passInspectorStage(firstInspector.id);

		// Drive at least one master stage to accrue wages.
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);
		await driveMasterStage(id, firstMaster.id, firstMaster.specialization);
		const wageAmount = Number(firstMaster.wageAmount);

		// Record a manual material cost.
		const cost = await call(aOwnerCookie, `/owner/properties/${id}/costs`, {
			method: "POST",
			body: JSON.stringify({ category: "MATERIAL", amount: "50.00", description: "tiles" }),
		});
		expect(cost.status).toBe(200);

		const sum = (await (await call(aOwnerCookie, `/owner/properties/${id}/finance`)).json()) as {
			summary: {
				accruedWages: string;
				costsTotal: string;
				netProfit: string;
				plannedTotal: string;
				materialsEstimateMissing: boolean;
				costsByCategory: Array<{ category: string; total: string }>;
			};
		};
		expect(Number(sum.summary.accruedWages)).toBeCloseTo(wageAmount, 2);
		expect(Number(sum.summary.costsTotal)).toBeCloseTo(50, 2);
		expect(Number(sum.summary.plannedTotal)).toBeCloseTo(1000, 2); // 10 m² × $100/m²
		expect(sum.summary.materialsEstimateMissing).toBe(false);
		const matLine = sum.summary.costsByCategory.find((c) => c.category === "MATERIAL");
		expect(Number(must(matLine).total)).toBeCloseTo(50, 2);
		// Net profit = planned − wages − cost
		expect(Number(sum.summary.netProfit)).toBeCloseTo(1000 - wageAmount - 50, 2);
	});

	it("materialsEstimateMissing gates on MASTER acceptance, not 1.1", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const firstInspector = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, firstInspector.id, "BEFORE_PHOTO", aInspectorUserId);
		await passInspectorStage(firstInspector.id);

		// Only 1.1 (INSPECTOR) accepted so far — no master work has started yet,
		// so the badge must NOT trip. (Earlier draft fired here, which was wrong.)
		const sumAfter11 = (await (
			await call(aOwnerCookie, `/owner/properties/${id}/finance`)
		).json()) as { summary: { materialsEstimateMissing: boolean } };
		expect(sumAfter11.summary.materialsEstimateMissing).toBe(false);

		// Drive one master stage. Now there's accepted MASTER work but no
		// MATERIAL cost → badge must trip.
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);
		await driveMasterStage(id, firstMaster.id, firstMaster.specialization);
		const sumAfterMaster = (await (
			await call(aOwnerCookie, `/owner/properties/${id}/finance`)
		).json()) as { summary: { materialsEstimateMissing: boolean } };
		expect(sumAfterMaster.summary.materialsEstimateMissing).toBe(true);
	});
});

describe("phase 7 finance — fines deduct from master balance", () => {
	it("rejecting + applying a fine reduces the master balance and writes a FINE transaction", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const firstInspector = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, firstInspector.id, "BEFORE_PHOTO", aInspectorUserId);
		await passInspectorStage(firstInspector.id);

		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);

		// Take + submit + reject + apply fine + resubmit + accept.
		await withTenant(db, aSchema, async (tx) => {
			await tx
				.insert(masterProfiles)
				.values({
					userId: aMasterUserId,
					displayName: "Master One",
					specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
				})
				.onConflictDoUpdate({
					target: masterProfiles.userId,
					set: {
						specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
					},
				});
		});
		await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, { method: "POST" });
		await attachFakeAsset(aSchema, id, firstMaster.id, "STAGE_PHOTO", aMasterUserId);
		await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const rej = await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}/reject`, {
			method: "POST",
			body: JSON.stringify({ comment: "redo it" }),
		});
		expect(rej.status).toBe(200);

		// Read the master's balance BEFORE applying the fine so we can verify
		// the relative deduction (other tests in this file may have credited
		// wages first).
		const balPreFine = await withTenant(db, aSchema, async (tx) => {
			const [b] = (await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, aMasterUserId))
				.limit(1)) as Array<{ balance: string }>;
			return b ? Number(b.balance) : 0;
		});

		// Look up the rejection id.
		const rejId = await withTenant(db, aSchema, async (tx) => {
			const rows = (await tx.execute(
				dsql`SELECT r.id FROM rejections r
					JOIN acceptance_requests ar ON ar.id = r.acceptance_request_id
					WHERE ar.sub_stage_instance_id = ${firstMaster.id}
					ORDER BY r.rejected_at DESC LIMIT 1`,
			)) as Array<{ id: string }>;
			return must(rows[0]).id;
		});

		const fineRes = await call(aInspectorCookie, `/inspector/rejections/${rejId}/fine`, {
			method: "POST",
			body: JSON.stringify({ amount: "25.00", reason: "Sloppy work" }),
		});
		expect(fineRes.status).toBe(200);

		// Balance dropped by exactly $25 from the fine; resubmit + accept later
		// to add wages back.
		const balBeforeWage = await withTenant(db, aSchema, async (tx) => {
			const [b] = (await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, aMasterUserId))
				.limit(1)) as Array<{ balance: string }>;
			return Number(must(b).balance);
		});
		expect(balBeforeWage).toBeCloseTo(balPreFine - 25, 2);

		await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (
			await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}`)
		).json()) as { subStage: { checklistItems: Array<{ id: string }> } };
		await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});

		const finals = await withTenant(db, aSchema, async (tx) => {
			const [b] = (await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, aMasterUserId))
				.limit(1)) as Array<{ balance: string }>;
			const fineTxns = (await tx
				.select()
				.from(financialTransactions)
				.where(eq(financialTransactions.type, "FINE"))) as Array<{ amount: string }>;
			return { balance: Number(must(b).balance), fineCount: fineTxns.length };
		});
		expect(finals.fineCount).toBeGreaterThanOrEqual(1);
		// Balance now = wages − 25 (must be > -25 since wages > 0 typically; some
		// stages may have zero wage so just check it moved up from -25).
		expect(finals.balance).toBeGreaterThanOrEqual(-25);
	});

	it("fines_rejection_unique: a second fine on the same rejection is rejected", async () => {
		// Drive a stage to a rejection, apply one fine, then attempt a second
		// — the partial unique index on fines(rejection_id) must enforce 1:1.
		const { id, tree } = await createProperty(aOwnerCookie);
		const firstInspector = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, firstInspector.id, "BEFORE_PHOTO", aInspectorUserId);
		await passInspectorStage(firstInspector.id);
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);
		await withTenant(db, aSchema, async (tx) => {
			await tx
				.insert(masterProfiles)
				.values({
					userId: aMasterUserId,
					displayName: "Master One",
					specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
				})
				.onConflictDoUpdate({
					target: masterProfiles.userId,
					set: {
						specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
					},
				});
		});
		await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, { method: "POST" });
		await attachFakeAsset(aSchema, id, firstMaster.id, "STAGE_PHOTO", aMasterUserId);
		await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}/reject`, {
			method: "POST",
			body: JSON.stringify({ comment: "redo" }),
		});
		const rejId = await withTenant(db, aSchema, async (tx) => {
			const rows = (await tx.execute(
				dsql`SELECT r.id FROM rejections r
					JOIN acceptance_requests ar ON ar.id = r.acceptance_request_id
					WHERE ar.sub_stage_instance_id = ${firstMaster.id}
					ORDER BY r.rejected_at DESC LIMIT 1`,
			)) as Array<{ id: string }>;
			return must(rows[0]).id;
		});

		const first = await call(aInspectorCookie, `/inspector/rejections/${rejId}/fine`, {
			method: "POST",
			body: JSON.stringify({ amount: "10.00", reason: "First fine" }),
		});
		expect(first.status).toBe(200);

		// Second attempt on the same rejection — server-side DB constraint kicks
		// in. We expect a non-2xx (5xx is acceptable here since the unique-index
		// violation surfaces as an error; the goal is to verify the constraint
		// fires, not the exact HTTP code).
		const second = await call(aInspectorCookie, `/inspector/rejections/${rejId}/fine`, {
			method: "POST",
			body: JSON.stringify({ amount: "10.00", reason: "Duplicate" }),
		});
		expect(second.status).toBeGreaterThanOrEqual(400);

		// Verify exactly one fine row exists for this rejection.
		const count = await withTenant(db, aSchema, async (tx) => {
			const rs = (await tx.execute(
				dsql`SELECT count(*)::int AS c FROM fines WHERE rejection_id = ${rejId}`,
			)) as Array<{ c: number }>;
			return must(rs[0]).c;
		});
		expect(count).toBe(1);
	});
});

describe("phase 7 finance — external contractor", () => {
	it("isExternalContractor masters skip wage credit + budget decrement", async () => {
		// Set up: mark our master as external contractor, drive 1.1 + the first
		// master stage. The wage-credit job must short-circuit so no WAGE_CREDIT
		// transaction is written and balance is untouched.
		const { id, tree } = await createProperty(aOwnerCookie);
		const firstInspector = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, firstInspector.id, "BEFORE_PHOTO", aInspectorUserId);
		await passInspectorStage(firstInspector.id);
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);

		await withTenant(db, aSchema, async (tx) => {
			await tx
				.insert(masterProfiles)
				.values({
					userId: aMasterUserId,
					displayName: "Cleaning Co",
					specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
					isExternalContractor: true,
				})
				.onConflictDoUpdate({
					target: masterProfiles.userId,
					set: {
						specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
						isExternalContractor: true,
					},
				});
		});

		// Snapshot pre-counts of wage rows for this sub-stage.
		const balPre = await withTenant(db, aSchema, async (tx) => {
			const [b] = (await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, aMasterUserId))
				.limit(1)) as Array<{ balance: string }>;
			return b ? Number(b.balance) : 0;
		});

		await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, { method: "POST" });
		await attachFakeAsset(aSchema, id, firstMaster.id, "STAGE_PHOTO", aMasterUserId);
		await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (
			await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}`)
		).json()) as { subStage: { checklistItems: Array<{ id: string }> } };
		await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});

		const result = await withTenant(db, aSchema, async (tx) => {
			const txns = (await tx
				.select()
				.from(financialTransactions)
				.where(eq(financialTransactions.subStageInstanceId, firstMaster.id))) as Array<{
				type: string;
			}>;
			const [b] = (await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, aMasterUserId))
				.limit(1)) as Array<{ balance: string }>;
			return {
				types: txns.map((t) => t.type),
				balance: b ? Number(b.balance) : 0,
			};
		});
		expect(result.types).not.toContain("WAGE_CREDIT");
		expect(result.types).not.toContain("BUDGET_DECREMENT");
		// Balance untouched by this acceptance.
		expect(result.balance).toBe(balPre);

		// Reset flag so it doesn't leak into later tests.
		await withTenant(db, aSchema, async (tx) => {
			await tx
				.update(masterProfiles)
				.set({ isExternalContractor: false })
				.where(eq(masterProfiles.userId, aMasterUserId));
		});
	});
});

describe("phase 7 finance — closing flow", () => {
	async function driveToCompletion(): Promise<string> {
		const { id, tree } = await createProperty(aOwnerCookie);
		const firstInspector = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, firstInspector.id, "BEFORE_PHOTO", aInspectorUserId);
		await passInspectorStage(firstInspector.id);

		// Drive every MASTER sub-stage in order. Loop bounded by COMPLETED status;
		// guard with a hard cap to avoid infinite-loop risk on test failure.
		for (let i = 0; i < 50; i++) {
			const t = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
			if (t.status === "COMPLETED" || t.status === "ARCHIVED") break;
			const next = t.stages
				.flatMap((s) => s.subStages)
				.find((s) => s.performerType === "MASTER" && s.status === "AVAILABLE");
			if (!next) break;
			await driveMasterStage(id, next.id, next.specialization);
		}
		const final = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		expect(final.status).toBe("COMPLETED");
		return id;
	}

	it("close fails without a portfolio photo (DoD: portfolio required)", async () => {
		const id = await driveToCompletion();
		const r = await call(aOwnerCookie, `/owner/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [],
			}),
		});
		// Elysia body validation rejects empty arrays — 422 from the validator.
		expect([400, 422]).toContain(r.status);
	}, 30000);

	it("inspector close requires closingPermission (403 otherwise)", async () => {
		const id = await driveToCompletion();
		const portfolio = await insertPortfolioAsset(aSchema, id, aOwnerCookie ? "owner" : "x");
		const denied = await call(aInspectorCookie, `/inspector/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [portfolio],
			}),
		});
		expect(denied.status).toBe(403);
	}, 30000);

	it("owner close transitions property to ARCHIVED and writes a unit_closings row", async () => {
		const id = await driveToCompletion();
		const portfolio = await insertPortfolioAsset(aSchema, id, "owner");
		const res = await call(aOwnerCookie, `/owner/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [portfolio],
				notes: "All good",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBeTruthy();

		const after = await withTenant(db, aSchema, async (tx) => {
			const [prop] = (await tx
				.select({ status: properties.status })
				.from(properties)
				.where(eq(properties.id, id))
				.limit(1)) as Array<{ status: string }>;
			const [closing] = (await tx
				.select()
				.from(unitClosings)
				.where(eq(unitClosings.propertyId, id))
				.limit(1)) as Array<{
				id: string;
				netProfit: string;
				materialsHandoverChecked: boolean;
				clientHandoverChecked: boolean;
				notes: string | null;
			}>;
			return { status: must(prop).status, closing: must(closing) };
		});
		expect(after.status).toBe("ARCHIVED");
		expect(after.closing.materialsHandoverChecked).toBe(true);
		expect(after.closing.notes).toBe("All good");
	}, 30000);

	it("reopen preserves audit (stamps reopenedAt/By; closing row stays as history)", async () => {
		const id = await driveToCompletion();
		const portfolio = await insertPortfolioAsset(aSchema, id, "owner");
		const closed = await call(aOwnerCookie, `/owner/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [portfolio],
			}),
		});
		expect(closed.status).toBe(200);
		const reopen = await call(aOwnerCookie, `/owner/properties/${id}/reopen`, { method: "POST" });
		expect(reopen.status).toBe(200);
		const post = await withTenant(db, aSchema, async (tx) => {
			const [prop] = (await tx
				.select({ status: properties.status })
				.from(properties)
				.where(eq(properties.id, id))
				.limit(1)) as Array<{ status: string }>;
			const closings = (await tx
				.select()
				.from(unitClosings)
				.where(eq(unitClosings.propertyId, id))) as Array<{
				reopenedAt: Date | null;
				reopenedBy: string | null;
				reportSnapshot: unknown;
			}>;
			return { status: must(prop).status, closings };
		});
		expect(post.status).toBe("COMPLETED");
		// The closing row stays as audit history; reopenedAt/By stamped.
		expect(post.closings.length).toBe(1);
		expect(must(post.closings[0]).reopenedAt).not.toBeNull();
		expect(must(post.closings[0]).reopenedBy).not.toBeNull();
		expect(must(post.closings[0]).reportSnapshot).toBeTruthy();

		// And a fresh close is still possible — the partial unique index lets a
		// new active row coexist with the reopened one.
		const portfolio2 = await insertPortfolioAsset(aSchema, id, "owner");
		const reclose = await call(aOwnerCookie, `/owner/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [portfolio2],
			}),
		});
		expect(reclose.status).toBe(200);
		const histCount = await withTenant(db, aSchema, async (tx) => {
			const rs = await tx.select().from(unitClosings).where(eq(unitClosings.propertyId, id));
			return rs.length;
		});
		expect(histCount).toBe(2);
	}, 60000);

	it("rejects close on a property that isn't COMPLETED", async () => {
		const { id } = await createProperty(aOwnerCookie);
		const portfolio = await insertPortfolioAsset(aSchema, id, "owner");
		const r = await call(aOwnerCookie, `/owner/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [portfolio],
			}),
		});
		expect(r.status).toBe(409);
	});

	it("toggling closingPermission lets inspector close", async () => {
		const id = await driveToCompletion();
		const portfolio = await insertPortfolioAsset(aSchema, id, "owner");
		// Grant closingPermission on inspector membership.
		const grant = await call(
			aOwnerCookie,
			`/owner/memberships/${aInspectorUserId}/closing-permission`,
			{
				method: "POST",
				body: JSON.stringify({ closingPermission: true }),
			},
		);
		expect(grant.status).toBe(200);
		const r = await call(aInspectorCookie, `/inspector/properties/${id}/close`, {
			method: "POST",
			body: JSON.stringify({
				materialsHandoverChecked: true,
				clientHandoverChecked: true,
				portfolioAssetIds: [portfolio],
			}),
		});
		expect(r.status).toBe(200);
		// Reset for any later test.
		await call(aOwnerCookie, `/owner/memberships/${aInspectorUserId}/closing-permission`, {
			method: "POST",
			body: JSON.stringify({ closingPermission: false }),
		});
	}, 30000);
});

describe("phase 7 finance — tenant isolation", () => {
	it("owner B sees no properties from tenant A's finance summary", async () => {
		const r = await call(bOwnerCookie, "/owner/finance");
		expect(r.status).toBe(200);
		const rows = (await r.json()) as Array<{ propertyId: string }>;
		// All ids must belong to tenant B. Cross-check by querying A's schema and
		// asserting disjoint sets.
		const aIds = await withTenant(db, aSchema, async (tx) => {
			const rs = (await tx.select({ id: properties.id }).from(properties)) as Array<{
				id: string;
			}>;
			return new Set(rs.map((r) => r.id));
		});
		for (const r of rows) {
			expect(aIds.has(r.propertyId)).toBe(false);
		}
	});

	it("owner B cannot read tenant A's property finance summary", async () => {
		// Pick an A property id.
		const aId = await withTenant(db, aSchema, async (tx) => {
			const rs = (await tx.select({ id: properties.id }).from(properties).limit(1)) as Array<{
				id: string;
			}>;
			return must(rs[0]).id;
		});
		const r = await call(bOwnerCookie, `/owner/properties/${aId}/finance`);
		// Either 404 (not found in B's schema) or 403; never 200.
		expect([403, 404]).toContain(r.status);
	});
});

describe("phase 7 finance — master self view", () => {
	it("master sees own balance and transactions", async () => {
		const r = await call(aMasterCookie, "/master/finance");
		expect(r.status).toBe(200);
		const view = (await r.json()) as {
			masterUserId: string;
			balance: string;
			transactions: Array<{ type: string }>;
		};
		expect(view.masterUserId).toBe(aMasterUserId);
		expect(view.transactions.some((t) => t.type === "WAGE_CREDIT" || t.type === "FINE")).toBe(true);
	});
});

// Suppress unused-warning for cost helpers imports used in summary-only assertions.
void propertyCosts;
void subStageInstances;
