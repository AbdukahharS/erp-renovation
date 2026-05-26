import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	tenantConfig,
	tenantMemberships,
	tenants,
	user as userTable,
} from "@repo/db/schema/control";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const superEmail = `super-${SUFFIX}@example.test`;
const plainEmail = `plain-${SUFFIX}@example.test`;
const provisionedSlug = `admin-${SUFFIX}`;
const provisionedOwnerEmail = `owner-admin-${SUFFIX}@example.test`;
const password = "test-password-123";

let superCookie = "";
let plainCookie = "";
let superUserId = "";
let plainUserId = "";
let provisionedTenantId = "";
let provisionedSchema = "";

async function signUp(email: string): Promise<string> {
	const res = await app.handle(
		new Request("http://localhost/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password, name: email }),
		}),
	);
	if (res.status !== 200) {
		throw new Error(`signup ${email} failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as { user: { id: string } };
	return body.user.id;
}

async function loginCookie(email: string): Promise<string> {
	const res = await app.handle(
		new Request("http://localhost/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(res.status).toBe(200);
	return (res.headers.get("set-cookie") ?? "")
		.split(",")
		.map((c) => c.split(";")[0])
		.join("; ");
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	superUserId = await signUp(superEmail);
	plainUserId = await signUp(plainEmail);
	await db.update(userTable).set({ isSuperAdmin: true }).where(eq(userTable.id, superUserId));
	superCookie = await loginCookie(superEmail);
	plainCookie = await loginCookie(plainEmail);
});

afterAll(async () => {
	if (provisionedSchema) {
		await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${provisionedSchema}" CASCADE`));
	}
	if (provisionedTenantId) {
		await db.delete(tenantConfig).where(eq(tenantConfig.tenantId, provisionedTenantId));
		await db.delete(tenantMemberships).where(eq(tenantMemberships.tenantId, provisionedTenantId));
		await db.delete(tenants).where(eq(tenants.id, provisionedTenantId));
	}
	await db
		.delete(userTable)
		.where(dsql`email IN (${superEmail}, ${plainEmail}, ${provisionedOwnerEmail})`);
});

describe("admin (super-admin gating)", () => {
	it("rejects non-super-admin from /admin/tenants", async () => {
		const res = await app.handle(
			new Request("http://localhost/admin/tenants", { headers: { cookie: plainCookie } }),
		);
		expect(res.status).toBe(403);
	});

	it("rejects unauthenticated /admin/tenants", async () => {
		const res = await app.handle(new Request("http://localhost/admin/tenants"));
		expect([401, 403]).toContain(res.status);
	});

	it("super-admin can list tenants", async () => {
		const res = await app.handle(
			new Request("http://localhost/admin/tenants", { headers: { cookie: superCookie } }),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ id: string }>;
		expect(Array.isArray(body)).toBe(true);
	});

	it("super-admin provisions a new tenant, default tenant_config inserted", async () => {
		const res = await app.handle(
			new Request("http://localhost/admin/tenants", {
				method: "POST",
				headers: { "content-type": "application/json", cookie: superCookie },
				body: JSON.stringify({
					name: `Admin ${SUFFIX}`,
					slug: provisionedSlug,
					ownerEmail: provisionedOwnerEmail,
					ownerName: provisionedOwnerEmail,
					ownerPassword: password,
				}),
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { tenantId: string; schemaName: string };
		provisionedTenantId = body.tenantId;
		provisionedSchema = body.schemaName;
		const [cfg] = await db
			.select()
			.from(tenantConfig)
			.where(eq(tenantConfig.tenantId, provisionedTenantId))
			.limit(1);
		expect(cfg).toBeTruthy();
		expect(cfg?.currencyCode).toBe("USD");
		expect(cfg?.photoRetentionDays).toBe(365);
	});

	it("suspend → resume cycle works and marks tenants.status", async () => {
		const suspended = await app.handle(
			new Request(`http://localhost/admin/tenants/${provisionedTenantId}/suspend`, {
				method: "POST",
				headers: { cookie: superCookie },
			}),
		);
		expect(suspended.status).toBe(200);
		const [t1] = await db
			.select({ status: tenants.status })
			.from(tenants)
			.where(eq(tenants.id, provisionedTenantId));
		expect(t1?.status).toBe("SUSPENDED");

		const resumed = await app.handle(
			new Request(`http://localhost/admin/tenants/${provisionedTenantId}/resume`, {
				method: "POST",
				headers: { cookie: superCookie },
			}),
		);
		expect(resumed.status).toBe(200);
		const [t2] = await db
			.select({ status: tenants.status })
			.from(tenants)
			.where(eq(tenants.id, provisionedTenantId));
		expect(t2?.status).toBe("ACTIVE");
	});

	it("non-super-admin cannot suspend a tenant", async () => {
		const res = await app.handle(
			new Request(`http://localhost/admin/tenants/${provisionedTenantId}/suspend`, {
				method: "POST",
				headers: { cookie: plainCookie },
			}),
		);
		expect(res.status).toBe(403);
	});

	it("/auth/me reports isSuperAdmin correctly", async () => {
		const r1 = await app.handle(
			new Request("http://localhost/auth/me", { headers: { cookie: superCookie } }),
		);
		const b1 = (await r1.json()) as { isSuperAdmin: boolean };
		expect(b1.isSuperAdmin).toBe(true);
		const r2 = await app.handle(
			new Request("http://localhost/auth/me", { headers: { cookie: plainCookie } }),
		);
		const b2 = (await r2.json()) as { isSuperAdmin: boolean };
		expect(b2.isSuperAdmin).toBe(false);
	});
});

// keep `plainUserId` referenced so the linter doesn't drop the binding.
void plainUserId;
