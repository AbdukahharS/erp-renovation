import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import { sql as dsql } from "drizzle-orm";
import { db, sql } from "../db.ts";
import { app } from "../index.ts";

// This is the permanent cross-tenant leakage test.
// It must stay green in CI forever — see PHASE-1-tenancy-auth.md §1.5.

const TEST_SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const acmeEmail = `owner-acme-${TEST_SUFFIX}@example.test`;
const betaEmail = `owner-beta-${TEST_SUFFIX}@example.test`;
const password = "test-password-123";

let acmeCookie = "";
let betaCookie = "";
let acmeTenantId = "";
let betaTenantId = "";
let acmeSchema = "";
let betaSchema = "";

async function provisionViaApi(name: string, slug: string, ownerEmail: string) {
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
				ownerEmail,
				ownerName: ownerEmail,
				ownerPassword: password,
			}),
		}),
	);
	if (res.status !== 200) {
		const txt = await res.text();
		throw new Error(`provision ${name} failed: ${res.status} ${txt}`);
	}
	return (await res.json()) as { tenantId: string; schemaName: string; ownerUserId: string };
}

async function loginAndSwitch(email: string, tenantId: string): Promise<string> {
	const res = await app.handle(
		new Request("http://localhost/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(res.status).toBe(200);
	const cookie = (res.headers.get("set-cookie") ?? "")
		.split(",")
		.map((c) => c.split(";")[0])
		.join("; ");
	const switched = await app.handle(
		new Request("http://localhost/auth/switch-tenant", {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ tenantId }),
		}),
	);
	expect(switched.status).toBe(200);
	return cookie;
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const acme = await provisionViaApi(`Acme ${TEST_SUFFIX}`, `acme-${TEST_SUFFIX}`, acmeEmail);
	const beta = await provisionViaApi(`Beta ${TEST_SUFFIX}`, `beta-${TEST_SUFFIX}`, betaEmail);
	acmeTenantId = acme.tenantId;
	betaTenantId = beta.tenantId;
	acmeSchema = acme.schemaName;
	betaSchema = beta.schemaName;
	acmeCookie = await loginAndSwitch(acmeEmail, acmeTenantId);
	betaCookie = await loginAndSwitch(betaEmail, betaTenantId);
});

afterAll(async () => {
	// Cleanup: drop both tenant schemas and rows.
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${acmeSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${betaSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${acmeTenantId}, ${betaTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${acmeTenantId}, ${betaTenantId})`);
	await db.delete(userTable).where(dsql`email IN (${acmeEmail}, ${betaEmail})`);
	await sql.end();
});

describe("tenant isolation", () => {
	it("each tenant's schema is what current_schema() reports", async () => {
		const a = await app.handle(
			new Request("http://localhost/tenant/whoami", { headers: { cookie: acmeCookie } }),
		);
		const b = await app.handle(
			new Request("http://localhost/tenant/whoami", { headers: { cookie: betaCookie } }),
		);
		expect(a.status).toBe(200);
		expect(b.status).toBe(200);
		const aBody = (await a.json()) as { currentSchema: string };
		const bBody = (await b.json()) as { currentSchema: string };
		expect(aBody.currentSchema).toBe(acmeSchema);
		expect(bBody.currentSchema).toBe(betaSchema);
		expect(aBody.currentSchema).not.toBe(bBody.currentSchema);
	});

	it("a tenant cannot see the other tenant's marker rows", async () => {
		const ins = (cookie: string, label: string) =>
			app.handle(
				new Request("http://localhost/tenant/marker", {
					method: "POST",
					headers: { "content-type": "application/json", cookie },
					body: JSON.stringify({ label }),
				}),
			);
		await ins(acmeCookie, "acme-marker");
		await ins(betaCookie, "beta-marker");

		const aList = (await (
			await app.handle(
				new Request("http://localhost/tenant/markers", { headers: { cookie: acmeCookie } }),
			)
		).json()) as Array<{ label: string }>;
		const bList = (await (
			await app.handle(
				new Request("http://localhost/tenant/markers", { headers: { cookie: betaCookie } }),
			)
		).json()) as Array<{ label: string }>;

		expect(aList.some((r) => r.label === "acme-marker")).toBe(true);
		expect(aList.some((r) => r.label === "beta-marker")).toBe(false);
		expect(bList.some((r) => r.label === "beta-marker")).toBe(true);
		expect(bList.some((r) => r.label === "acme-marker")).toBe(false);
	});

	it("concurrent requests do not leak search_path across the pool", async () => {
		const runs = 50;
		const tasks = Array.from({ length: runs }, (_, i) =>
			i % 2 === 0
				? app.handle(
						new Request("http://localhost/tenant/whoami", { headers: { cookie: acmeCookie } }),
					)
				: app.handle(
						new Request("http://localhost/tenant/whoami", { headers: { cookie: betaCookie } }),
					),
		);
		const results = await Promise.all(tasks);
		const bodies = await Promise.all(
			results.map((r) => r.json() as Promise<{ currentSchema: string }>),
		);
		bodies.forEach((b, i) => {
			expect(b.currentSchema).toBe(i % 2 === 0 ? acmeSchema : betaSchema);
		});
	});

	it("unauthenticated requests to /tenant/* are rejected", async () => {
		const res = await app.handle(new Request("http://localhost/tenant/whoami"));
		expect([401, 409]).toContain(res.status);
	});
});
