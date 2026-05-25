import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import {
	masterProfiles,
	propertyAssets,
	stageEvents,
	stageMediaAssets,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { acceptanceEvents } from "../modules/acceptance/events.ts";
import { auth } from "../modules/auth/auth.ts";
import { flushAcceptanceJobs } from "./job-runner.ts";

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `owner-acc-a-${SUFFIX}@example.test`;
const bOwnerEmail = `owner-acc-b-${SUFFIX}@example.test`;
const aInspectorEmail = `insp-acc-a-${SUFFIX}@example.test`;
const aMasterEmail = `mast-acc-a-${SUFFIX}@example.test`;
const aMaster2Email = `mast2-acc-a-${SUFFIX}@example.test`;
const password = "test-password-123";

let aOwnerCookie = "";
let bOwnerCookie = "";
let aInspectorCookie = "";
let aMasterCookie = "";
let aMaster2Cookie = "";
let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";
let aMasterUserId = "";
let aMaster2UserId = "";

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
	// Phase 5: drain in-process worker jobs so subsequent assertions see the
	// unlock + property-advance + notification rows the handlers wrote.
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
	areaSqm: string;
	stages: Array<{
		id: string;
		order: number;
		name: string;
		subStages: Array<{
			id: string;
			order: number;
			code: string;
			name: string;
			performerType: "MASTER" | "INSPECTOR";
			specialization: string | null;
			status: string;
			wageAmount: string;
		}>;
	}>;
};

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
	const { id } = (await res.json()) as { id: string };
	const tree = (await (await call(cookie, `/properties/${id}`)).json()) as Tree;
	return { id, tree };
}

/**
 * Bypass the R2 presign+upload+attach loop for tests by inserting a
 * property_asset + stage_media_asset directly. The real flow is exercised in
 * properties.test.ts (presign 503 / tenant-prefix check).
 */
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

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`AccA ${SUFFIX}`, `acc-a-${SUFFIX}`, aOwnerEmail);
	const b = await provision(`AccB ${SUFFIX}`, `acc-b-${SUFFIX}`, bOwnerEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aOwnerCookie = await loginAndSwitch(aOwnerEmail, aTenantId);
	bOwnerCookie = await loginAndSwitch(bOwnerEmail, bTenantId);
	await signUpAs(aInspectorEmail, "INSPECTOR", aTenantId);
	aInspectorCookie = await loginAndSwitch(aInspectorEmail, aTenantId);
	aMasterUserId = await signUpAs(aMasterEmail, "MASTER", aTenantId);
	aMasterCookie = await loginAndSwitch(aMasterEmail, aTenantId);
	aMaster2UserId = await signUpAs(aMaster2Email, "MASTER", aTenantId);
	aMaster2Cookie = await loginAndSwitch(aMaster2Email, aTenantId);
});

afterAll(async () => {
	const userIds = [aMasterUserId, aMaster2UserId].filter(Boolean);
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	await db
		.delete(userTable)
		.where(
			dsql`email IN (${aOwnerEmail}, ${bOwnerEmail}, ${aInspectorEmail}, ${aMasterEmail}, ${aMaster2Email})`,
		);
	void userIds;
});

describe("phase 4 acceptance loop", () => {
	it("Sub-stage 1.1 happy path: submit-self + accept → READY_FOR_PRODUCTION + first master stage AVAILABLE", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		expect(first.performerType).toBe("INSPECTOR");
		expect(first.status).toBe("AVAILABLE");

		// Attach a BEFORE_PHOTO to satisfy any required media requirement.
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");

		const submit = await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({ materialsOnSite: true }),
		});
		expect(submit.status).toBe(200);

		// Build empty results (1.1's checklist depending on TZ seed) by reading the
		// detail and Passing them all.
		const detail = (await (
			await call(aInspectorCookie, `/inspector/stages/${first.id}`)
		).json()) as {
			subStage: { checklistItems: Array<{ id: string }> };
		};
		const results = detail.subStage.checklistItems.map((i) => ({
			checklistItemInstanceId: i.id,
			passed: true,
		}));

		const accept = await call(aInspectorCookie, `/inspector/stages/${first.id}/accept`, {
			method: "POST",
			body: JSON.stringify({ results }),
		});
		expect(accept.status).toBe(200);

		const after = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		expect(after.status).toBe("READY_FOR_PRODUCTION");
		const firstMaster = after.stages
			.flatMap((s) => s.subStages)
			.find((s) => s.performerType === "MASTER");
		expect(must(firstMaster).status).toBe("AVAILABLE");
	});

	it("master open-claim flow with specialization filter; race resolves to one winner", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
		await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (await call(aInspectorCookie, `/inspector/stages/${first.id}`)).json()) as {
			subStage: { checklistItems: Array<{ id: string }> };
		};
		await call(aInspectorCookie, `/inspector/stages/${first.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});

		// Pick the first master sub-stage and its specialization
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);

		// Give master1 the matching specialization; master2 left with none → 403.
		await call(aOwnerCookie, "/owner/master-profiles", {
			method: "POST",
			body: JSON.stringify({
				userId: aMasterUserId,
				displayName: "Master One",
				specializations: firstMaster.specialization ? [firstMaster.specialization] : [],
			}),
		});
		await call(aOwnerCookie, "/owner/master-profiles", {
			method: "POST",
			body: JSON.stringify({
				userId: aMaster2UserId,
				displayName: "Master Two",
				specializations: [],
			}),
		});

		// available list for master1 includes it; master2 does not (if spec set).
		const avail1 = (await (await call(aMasterCookie, "/master/available-stages")).json()) as Array<{
			subStageInstanceId: string;
		}>;
		expect(avail1.some((r) => r.subStageInstanceId === firstMaster.id)).toBe(true);

		// Race: two concurrent take attempts; expect one 200 and one 409.
		const [r1, r2] = await Promise.all([
			call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, { method: "POST" }),
			call(aMaster2Cookie, `/master/stages/${firstMaster.id}/take`, { method: "POST" }),
		]);
		const [low, high] = [r1.status, r2.status].sort() as [number, number];
		// One success, one denial (409 from claim conflict or 403 from spec mismatch).
		expect(low).toBe(200);
		expect([403, 409]).toContain(high);

		// Property transitions to IN_PROGRESS on the first master take.
		const after = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		expect(after.status).toBe("IN_PROGRESS");
	});

	it("submit blocked without required media (server-side)", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
		await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (await call(aInspectorCookie, `/inspector/stages/${first.id}`)).json()) as {
			subStage: { checklistItems: Array<{ id: string }> };
		};
		await call(aInspectorCookie, `/inspector/stages/${first.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const firstMaster = must(
			refreshed.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);

		// Master claim (use master1 with matching spec set in beforeAll-driven prior test? safer: upsert)
		await call(aOwnerCookie, `/owner/master-profiles/`, { method: "GET" });
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
		const take = await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, {
			method: "POST",
		});
		expect(take.status).toBe(200);

		// Check requirements: if there's at least one required, submit without media → 400.
		const hasRequired = await withTenant(db, aSchema, async (tx) => {
			const rows = (await tx.execute(
				dsql`SELECT count(*)::int AS c FROM media_requirement_instances WHERE sub_stage_instance_id = ${firstMaster.id} AND required = true`,
			)) as Array<{ c: number }>;
			return (must(rows[0]).c ?? 0) > 0;
		});

		const submitNoMedia = await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		if (hasRequired) {
			expect(submitNoMedia.status).toBe(400);
		} else {
			expect(submitNoMedia.status).toBe(200);
		}
	});

	it("BLOCK persists on root sub-stage (1.1) with no incoming dep edges", async () => {
		const { tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		expect(first.status).toBe("AVAILABLE");

		const block = await call(aInspectorCookie, `/inspector/stages/${first.id}/manual-override`, {
			method: "POST",
			body: JSON.stringify({ action: "BLOCK", reason: "halt; meter dispute" }),
		});
		expect(block.status).toBe(200);

		// Status flipped to LOCKED and the manual_blocked column is persisted on the
		// sub-stage row itself (root has no deps to carry it).
		const blocked = await withTenant(db, aSchema, async (tx) => {
			const rows = (await tx.execute(
				dsql`SELECT status, manual_blocked, manual_blocked_reason
					FROM sub_stage_instances WHERE id = ${first.id}`,
			)) as Array<{
				status: string;
				manual_blocked: boolean;
				manual_blocked_reason: string | null;
			}>;
			return must(rows[0]);
		});
		expect(blocked.status).toBe("LOCKED");
		expect(blocked.manual_blocked).toBe(true);
		expect(blocked.manual_blocked_reason).toBe("halt; meter dispute");

		// Inspector cannot submit-self while blocked (status is LOCKED, fails canTransition).
		const sub = await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		expect(sub.status).toBe(409);

		// UNBLOCK clears it and restores AVAILABLE.
		const unblock = await call(aInspectorCookie, `/inspector/stages/${first.id}/manual-override`, {
			method: "POST",
			body: JSON.stringify({ action: "UNBLOCK", reason: "resolved" }),
		});
		expect(unblock.status).toBe(200);
		const after = await withTenant(db, aSchema, async (tx) => {
			const rows = (await tx.execute(
				dsql`SELECT status, manual_blocked FROM sub_stage_instances WHERE id = ${first.id}`,
			)) as Array<{ status: string; manual_blocked: boolean }>;
			return must(rows[0]);
		});
		expect(after.status).toBe("AVAILABLE");
		expect(after.manual_blocked).toBe(false);
	});

	it("predecessor invariant: taking second master stage before first accepted → 409", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
		await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (await call(aInspectorCookie, `/inspector/stages/${first.id}`)).json()) as {
			subStage: { checklistItems: Array<{ id: string }> };
		};
		await call(aInspectorCookie, `/inspector/stages/${first.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});

		// Find the second master sub-stage (third overall: 1.1 inspector, first master, second master).
		const refreshed = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const masters = refreshed.stages
			.flatMap((s) => s.subStages)
			.filter((s) => s.performerType === "MASTER");
		const secondMaster = must(masters[1]);
		expect(secondMaster.status).toBe("LOCKED");

		// Upsert profile to match second master spec so the spec check passes; we
		// want the predecessor invariant — not the spec check — to be what fails.
		await withTenant(db, aSchema, async (tx) => {
			await tx
				.insert(masterProfiles)
				.values({
					userId: aMasterUserId,
					displayName: "Master One",
					specializations: secondMaster.specialization ? [secondMaster.specialization] : [],
				})
				.onConflictDoUpdate({
					target: masterProfiles.userId,
					set: {
						specializations: secondMaster.specialization ? [secondMaster.specialization] : [],
					},
				});
		});
		const r = await call(aMasterCookie, `/master/stages/${secondMaster.id}/take`, {
			method: "POST",
		});
		// Locked is not in AVAILABLE → 409 from status check, or 409 from isUnlocked.
		expect(r.status).toBe(409);
	});

	it("manual block + force-unblock: BLOCK→409 on take; FORCE_UNBLOCK→take succeeds; audit recorded", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
		await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (await call(aInspectorCookie, `/inspector/stages/${first.id}`)).json()) as {
			subStage: { checklistItems: Array<{ id: string }> };
		};
		await call(aInspectorCookie, `/inspector/stages/${first.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});
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

		// Inspector blocks the first master stage.
		const block = await call(
			aInspectorCookie,
			`/inspector/stages/${firstMaster.id}/manual-override`,
			{
				method: "POST",
				body: JSON.stringify({ action: "BLOCK", reason: "stop work, found leak" }),
			},
		);
		expect(block.status).toBe(200);
		const r1 = await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, {
			method: "POST",
		});
		expect(r1.status).toBe(409);

		// Force-unblock — sets manual_override=UNBLOCKED, status → AVAILABLE.
		const force = await call(
			aInspectorCookie,
			`/inspector/stages/${firstMaster.id}/manual-override`,
			{
				method: "POST",
				body: JSON.stringify({ action: "FORCE_UNBLOCK", reason: "resolved offline" }),
			},
		);
		expect(force.status).toBe(200);
		const r2 = await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, {
			method: "POST",
		});
		expect(r2.status).toBe(200);

		// Audit event captured in stage_events.
		const audit = await withTenant(db, aSchema, async (tx) => {
			return (await tx
				.select({ type: stageEvents.eventType })
				.from(stageEvents)
				.where(eq(stageEvents.subStageInstanceId, firstMaster.id))) as Array<{ type: string }>;
		});
		const types = audit.map((a) => a.type);
		expect(types).toContain("MANUAL_BLOCKED");
		expect(types).toContain("MANUAL_UNBLOCKED");
	});

	it("reject loop: submit → reject → IN_PROGRESS → resubmit → accept", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
		await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		const det = (await (await call(aInspectorCookie, `/inspector/stages/${first.id}`)).json()) as {
			subStage: { checklistItems: Array<{ id: string }> };
		};
		await call(aInspectorCookie, `/inspector/stages/${first.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});
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
		const take = await call(aMasterCookie, `/master/stages/${firstMaster.id}/take`, {
			method: "POST",
		});
		expect(take.status).toBe(200);
		await attachFakeAsset(aSchema, id, firstMaster.id, "STAGE_PHOTO", aMasterUserId);
		const sub = await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		expect(sub.status).toBe(200);

		const rej = await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}/reject`, {
			method: "POST",
			body: JSON.stringify({ comment: "wall not flat" }),
		});
		expect(rej.status).toBe(200);

		const afterReject = (await (await call(aOwnerCookie, `/properties/${id}`)).json()) as Tree;
		const fm2 = must(
			afterReject.stages.flatMap((s) => s.subStages).find((s) => s.id === firstMaster.id),
		);
		// Master-performed → returns to IN_PROGRESS, claim stays.
		expect(fm2.status).toBe("IN_PROGRESS");

		const sub2 = await call(aMasterCookie, `/master/stages/${firstMaster.id}/submit`, {
			method: "POST",
			body: JSON.stringify({}),
		});
		expect(sub2.status).toBe(200);

		const det2 = (await (
			await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}`)
		).json()) as { subStage: { checklistItems: Array<{ id: string }> } };
		const acc = await call(aInspectorCookie, `/inspector/stages/${firstMaster.id}/accept`, {
			method: "POST",
			body: JSON.stringify({
				results: det2.subStage.checklistItems.map((i) => ({
					checklistItemInstanceId: i.id,
					passed: true,
				})),
			}),
		});
		expect(acc.status).toBe(200);
	});

	it("cross-tenant isolation: tenant B cannot accept tenant A's stage", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
		await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
			method: "POST",
			body: JSON.stringify({}),
		});

		// Owner B cannot read A's stage (no inspector role on B; testing that
		// even with the wrong tenant context, the sub-stage lookup misses).
		const res = await call(bOwnerCookie, `/inspector/stages/${first.id}`);
		// 403 (B is OWNER, not INSPECTOR) or 404 (tenant A's stage isn't in B's schema).
		expect([403, 404]).toContain(res.status);
	});

	it("domain event emitter fires + stage_events row written", async () => {
		const { id, tree } = await createProperty(aOwnerCookie);
		const first = must(tree.stages[0]?.subStages[0]);
		await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");

		const seen: string[] = [];
		const off = acceptanceEvents.onEvent((e) => seen.push(e.type));
		try {
			await call(aInspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
				method: "POST",
				body: JSON.stringify({}),
			});
		} finally {
			off();
		}
		expect(seen).toContain("SUBMITTED");

		const dbEvents = await withTenant(db, aSchema, async (tx) => {
			return (await tx
				.select({ type: stageEvents.eventType })
				.from(stageEvents)
				.where(eq(stageEvents.subStageInstanceId, first.id))) as Array<{ type: string }>;
		});
		expect(dbEvents.some((e) => e.type === "SUBMITTED")).toBe(true);
	});
});
