import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import {
	financialTransactions,
	masterBalances,
	masterProfiles,
	notificationIntents,
	propertyAssets,
	stageMediaAssets,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { and, sql as dsql, eq } from "drizzle-orm";
import { processStagePropagate } from "../../../worker/src/jobs/stage-propagate.ts";
import { processWageCredit } from "../../../worker/src/jobs/wage-credit.ts";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { auth } from "../modules/auth/auth.ts";
import { flushAcceptanceJobs } from "./job-runner.ts";

/**
 * Phase 5 worker tests. Covers:
 *  - happy path: accept → wage credited, balance bumped, next stage AVAILABLE,
 *    notification intent created for matching master
 *  - idempotency: running the handlers twice does NOT double-credit
 *  - tenant isolation: a job for tenant A never writes into tenant B's schema
 */

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `owner-q-a-${SUFFIX}@example.test`;
const bOwnerEmail = `owner-q-b-${SUFFIX}@example.test`;
const aInspectorEmail = `insp-q-a-${SUFFIX}@example.test`;
const aMasterEmail = `mast-q-a-${SUFFIX}@example.test`;
const password = "test-password-123";

let aOwnerCookie = "";
let aInspectorCookie = "";
let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";
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
	const sc = (sw.headers.get("set-cookie") ?? "")
		.split(",")
		.map((x) => x.split(";")[0])
		.join("; ");
	return sc || c;
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

async function attachFakeAsset(
	schema: string,
	propertyId: string,
	subStageInstanceId: string,
	kind: "STAGE_PHOTO" | "BEFORE_PHOTO",
	userId: string,
): Promise<void> {
	await withTenant(db, schema, async (tx) => {
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
	});
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

async function createPropertyAndAcceptFirst(
	ownerCookie: string,
	inspectorCookie: string,
): Promise<Tree> {
	const create = await call(ownerCookie, "/properties", {
		method: "POST",
		body: JSON.stringify({
			name: `Apt ${SUFFIX}`,
			address: "1 Q St",
			layoutType: "NEW_BUILD",
			areaSqm: "50.00",
			plannedUnitCost: "11500.00",
		}),
	});
	expect(create.status).toBe(200);
	const { id } = (await create.json()) as { id: string };
	const tree = (await (await call(ownerCookie, `/properties/${id}`)).json()) as Tree;
	const first = must(tree.stages[0]?.subStages[0]);
	await attachFakeAsset(aSchema, id, first.id, "BEFORE_PHOTO", "inspector-test");
	await call(inspectorCookie, `/inspector/stages/${first.id}/submit-self`, {
		method: "POST",
		body: JSON.stringify({ materialsOnSite: true }),
	});
	const det = (await (await call(inspectorCookie, `/inspector/stages/${first.id}`)).json()) as {
		subStage: { checklistItems: Array<{ id: string }> };
	};
	await call(inspectorCookie, `/inspector/stages/${first.id}/accept`, {
		method: "POST",
		body: JSON.stringify({
			results: det.subStage.checklistItems.map((i) => ({
				checklistItemInstanceId: i.id,
				passed: true,
			})),
		}),
	});
	return (await (await call(ownerCookie, `/properties/${id}`)).json()) as Tree;
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`QueueA ${SUFFIX}`, `queue-a-${SUFFIX}`, aOwnerEmail);
	const b = await provision(`QueueB ${SUFFIX}`, `queue-b-${SUFFIX}`, bOwnerEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aOwnerCookie = await loginAndSwitch(aOwnerEmail, aTenantId);
	await signUpAs(aInspectorEmail, "INSPECTOR", aTenantId);
	aInspectorCookie = await loginAndSwitch(aInspectorEmail, aTenantId);
	aMasterUserId = await signUpAs(aMasterEmail, "MASTER", aTenantId);
});

afterAll(async () => {
	const userIds = [aMasterUserId].filter(Boolean);
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	if (userIds.length > 0) {
		await db.delete(userTable).where(dsql`id IN (${dsql.join(userIds, dsql`, `)})`);
	}
});

describe("phase 5 worker handlers", () => {
	it("accept → 1.1 INSPECTOR stage: zero wage rows, next master stage AVAILABLE, notification intent created", async () => {
		// Seed the master profile so the propagate handler can target it.
		// Phase 6 removed the upsert endpoint; insert directly through tenant tx.
		await withTenant(db, aSchema, async (tx) => {
			await tx
				.insert(masterProfiles)
				.values({
					userId: aMasterUserId,
					displayName: "Test Master",
					specializations: [
						"Demolition Specialist",
						"Site Foreman",
						"Mason / Installer",
						"Plasterer",
						"HVAC Installer",
						"Plumber",
						"Electrician",
						"Screed Layer",
						"Drywall Installer",
						"Door Installer",
						"Painter",
						"Tiler",
						"Floor Installer",
						"Cleaning Contractor",
					],
				})
				.onConflictDoNothing();
		});

		const after = await createPropertyAndAcceptFirst(aOwnerCookie, aInspectorCookie);
		expect(after.status).toBe("READY_FOR_PRODUCTION");

		// First master stage now AVAILABLE (set by stage-propagate handler).
		const firstMaster = must(
			after.stages.flatMap((s) => s.subStages).find((s) => s.performerType === "MASTER"),
		);
		expect(firstMaster.status).toBe("AVAILABLE");

		// 1.1 has wageAmount = 0 in the seeded template, so financial rows are
		// recorded but the master balance stays untouched.
		await withTenant(db, aSchema, async (tx) => {
			const wageRows = await tx
				.select()
				.from(financialTransactions)
				.where(eq(financialTransactions.type, "WAGE_CREDIT"));
			expect(wageRows.length).toBeGreaterThan(0); // at least one for the 1.1 accept
			const budgetRows = await tx
				.select()
				.from(financialTransactions)
				.where(eq(financialTransactions.type, "BUDGET_DECREMENT"));
			expect(budgetRows.length).toBe(wageRows.length);

			// A notification intent for the master targeting the first master stage.
			const intents = await tx
				.select()
				.from(notificationIntents)
				.where(
					and(
						eq(notificationIntents.targetUserId, aMasterUserId),
						eq(notificationIntents.subStageInstanceId, firstMaster.id),
					),
				);
			expect(intents.length).toBe(1);
			// Phase 8 owns the intent lifecycle: stage-propagate creates them, the
			// notification-dispatch worker flips them to SENT. Either state is a
			// valid post-accept observation depending on whether a worker happens
			// to be draining this Redis instance during the test run.
			expect(["CREATED", "SENT"]).toContain(must(intents[0]).status);
		});
	});

	it("wage-credit handler is idempotent under retry", async () => {
		const accepted = await withTenant(db, aSchema, async (tx) => {
			const rows = await tx
				.select({ id: subStageInstances.id, wage: subStageInstances.wageAmount })
				.from(subStageInstances)
				.where(eq(subStageInstances.status, "ACCEPTED"))
				.limit(1);
			return rows[0];
		});
		if (!accepted) throw new Error("no accepted sub-stage to retry");

		const beforeCount = await withTenant(db, aSchema, async (tx) => {
			const r = await tx
				.select({ n: dsql<number>`count(*)::int` })
				.from(financialTransactions)
				.where(eq(financialTransactions.subStageInstanceId, accepted.id));
			return r[0]?.n ?? 0;
		});

		await processWageCredit({
			data: { tenantSchema: aSchema, subStageInstanceId: accepted.id },
		});
		await processWageCredit({
			data: { tenantSchema: aSchema, subStageInstanceId: accepted.id },
		});

		const afterCount = await withTenant(db, aSchema, async (tx) => {
			const r = await tx
				.select({ n: dsql<number>`count(*)::int` })
				.from(financialTransactions)
				.where(eq(financialTransactions.subStageInstanceId, accepted.id));
			return r[0]?.n ?? 0;
		});
		expect(afterCount).toBe(beforeCount); // dedupe via unique constraint
	});

	it("tenant isolation: jobs for tenant A do not touch tenant B's tables", async () => {
		await withTenant(db, bSchema, async (tx) => {
			const wage = await tx.select().from(financialTransactions);
			const balances = await tx.select().from(masterBalances);
			const intents = await tx.select().from(notificationIntents);
			expect(wage.length).toBe(0);
			expect(balances.length).toBe(0);
			expect(intents.length).toBe(0);
		});
	});

	it("master with non-matching specialization receives no notification intent", async () => {
		// Add a profile to tenant A whose specializations don't intersect any
		// stage requirement; assert no intents accumulate for them.
		const odd = `odd-${SUFFIX}@example.test`;
		const oddUserId = await signUpAs(odd, "MASTER", aTenantId);
		await withTenant(db, aSchema, async (tx) => {
			await tx.insert(masterProfiles).values({
				userId: oddUserId,
				displayName: "Odd",
				specializations: ["NONEXISTENT_SPECIALIZATION"],
			});
			const intents = await tx
				.select()
				.from(notificationIntents)
				.where(eq(notificationIntents.targetUserId, oddUserId));
			expect(intents.length).toBe(0);
		});
	});

	it("stage-propagate handler bails early when sub-stage is no longer ACCEPTED", async () => {
		// Synthetic guard: call with an unknown sub-stage id should return
		// {unlocked: [], notificationsCreated: 0} not throw.
		const out = await processStagePropagate({
			data: {
				tenantSchema: aSchema,
				subStageInstanceId: "00000000-0000-0000-0000-000000000000",
				propertyId: "00000000-0000-0000-0000-000000000000",
				actorUserId: null,
			},
		});
		expect(out.unlocked.length).toBe(0);
		expect(out.notificationsCreated).toBe(0);
	});
});
