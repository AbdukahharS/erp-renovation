import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { auth } from "../modules/auth/auth.ts";

function must<T>(v: T | undefined, msg = "expected value"): T {
	if (v === undefined) throw new Error(msg);
	return v;
}

// Templates-flavored extension of the Phase 1 cross-tenant isolation test.
// Provisions two tenants, edits A's seed, asserts B's seed is untouched, and
// confirms that A cannot mutate or read B's templates.

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aEmail = `owner-iso-a-${SUFFIX}@example.test`;
const bEmail = `owner-iso-b-${SUFFIX}@example.test`;
const password = "test-password-123";

let aCookie = "";
let bCookie = "";
let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";
let aTemplateId = "";
let bTemplateId = "";

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
	return (await res.json()) as { tenantId: string; schemaName: string; ownerUserId: string };
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

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`IsoA ${SUFFIX}`, `iso-a-${SUFFIX}`, aEmail);
	const b = await provision(`IsoB ${SUFFIX}`, `iso-b-${SUFFIX}`, bEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aCookie = await loginAndSwitch(aEmail, aTenantId);
	bCookie = await loginAndSwitch(bEmail, bTenantId);
	const aList = (await (await call(aCookie, "/templates")).json()) as Array<{ id: string }>;
	const bList = (await (await call(bCookie, "/templates")).json()) as Array<{ id: string }>;
	aTemplateId = must(aList[0]).id;
	bTemplateId = must(bList[0]).id;
	expect(aTemplateId).not.toBe(bTemplateId);
});

afterAll(async () => {
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(userTable).where(dsql`email IN (${aEmail}, ${bEmail})`);
});

describe("phase 2 templates isolation", () => {
	it("each tenant sees only its own seeded template", async () => {
		const a = (await (await call(aCookie, "/templates")).json()) as Array<{ id: string }>;
		const b = (await (await call(bCookie, "/templates")).json()) as Array<{ id: string }>;
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
		expect(must(a[0]).id).not.toBe(must(b[0]).id);
	});

	it("renaming a stage in A does not affect B", async () => {
		const aTree = (await (await call(aCookie, `/templates/${aTemplateId}`)).json()) as {
			stages: Array<{ id: string; name: string }>;
		};
		const stageId = must(aTree.stages[0]).id;
		const renamed = `RENAMED-A-${SUFFIX}`;
		const res = await call(aCookie, `/stages/${stageId}`, {
			method: "PATCH",
			body: JSON.stringify({ name: renamed }),
		});
		expect(res.status).toBe(200);

		const bTree = (await (await call(bCookie, `/templates/${bTemplateId}`)).json()) as {
			stages: Array<{ name: string }>;
		};
		expect(bTree.stages.find((s) => s.name === renamed)).toBeUndefined();
	});

	it("A cannot fetch B's template (404 in A's schema)", async () => {
		const res = await call(aCookie, `/templates/${bTemplateId}`);
		expect(res.status).toBe(404);
	});

	it("A cannot mutate a stage that belongs to B", async () => {
		const bTree = (await (await call(bCookie, `/templates/${bTemplateId}`)).json()) as {
			stages: Array<{ id: string }>;
		};
		const bStageId = must(bTree.stages[0]).id;
		const res = await call(aCookie, `/stages/${bStageId}`, {
			method: "PATCH",
			body: JSON.stringify({ name: "EVIL" }),
		});
		expect(res.status).toBe(404);
	});

	it("concurrent template fetches across A/B do not leak search_path", async () => {
		const tasks = Array.from({ length: 30 }, (_, i) =>
			i % 2 === 0
				? call(aCookie, `/templates/${aTemplateId}`)
				: call(bCookie, `/templates/${bTemplateId}`),
		);
		const results = await Promise.all(tasks);
		const bodies = await Promise.all(results.map((r) => r.json() as Promise<{ id: string }>));
		bodies.forEach((b, i) => {
			expect(b.id).toBe(i % 2 === 0 ? aTemplateId : bTemplateId);
		});
	});

	it("non-Owner role is forbidden from templates routes", async () => {
		const res = await app.handle(new Request("http://localhost/templates"));
		expect([401, 403, 409]).toContain(res.status);
	});

	it("INSPECTOR membership on the same tenant gets 403 on /templates", async () => {
		// Sign up an inspector user via Better Auth, then grant INSPECTOR membership
		// directly on tenant A (no Phase-1 helper exists for non-Owner provisioning).
		const inspectorEmail = `inspector-iso-${SUFFIX}@example.test`;
		const signUp = await auth.api.signUpEmail({
			body: { email: inspectorEmail, password, name: inspectorEmail },
		});
		const inspectorUserId = signUp.user.id;
		await db
			.insert(tenantMemberships)
			.values({ userId: inspectorUserId, tenantId: aTenantId, role: "INSPECTOR" });

		const inspectorCookie = await loginAndSwitch(inspectorEmail, aTenantId);
		const res = await call(inspectorCookie, "/templates");
		expect(res.status).toBe(403);

		// cleanup
		await db.delete(tenantMemberships).where(eq(tenantMemberships.userId, inspectorUserId));
		await db.delete(userTable).where(eq(userTable.id, inspectorUserId));
	});
});
