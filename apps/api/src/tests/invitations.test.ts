import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	invitations,
	tenantMemberships,
	tenants,
	user as userTable,
} from "@repo/db/schema/control";
import { sql as dsql } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerEmail = `inv-owner-${SUFFIX}@example.test`;
const inviteeEmail = `inv-master-${SUFFIX}@example.test`;
const password = "test-password-123";

let ownerCookie = "";
let tenantId = "";
let schemaName = "";

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
	const sw = await app.handle(
		new Request("http://localhost/auth/switch-tenant", {
			method: "POST",
			headers: { "content-type": "application/json", cookie },
			body: JSON.stringify({ tenantId: tid }),
		}),
	);
	expect(sw.status).toBe(200);
	return cookie;
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const t = await provision(`Inv ${SUFFIX}`, `inv-${SUFFIX}`, ownerEmail);
	tenantId = t.tenantId;
	schemaName = t.schemaName;
	ownerCookie = await loginAndSwitch(ownerEmail, tenantId);
});

afterAll(async () => {
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
	await db.delete(invitations).where(dsql`tenant_id = ${tenantId}`);
	await db.delete(tenantMemberships).where(dsql`tenant_id = ${tenantId}`);
	await db.delete(tenants).where(dsql`id = ${tenantId}`);
	await db.delete(userTable).where(dsql`email IN (${ownerEmail}, ${inviteeEmail})`);
});

describe("invitations", () => {
	let token = "";

	it("owner creates an invitation", async () => {
		const res = await app.handle(
			new Request("http://localhost/owner/invitations", {
				method: "POST",
				headers: { "content-type": "application/json", cookie: ownerCookie },
				body: JSON.stringify({ role: "MASTER", email: inviteeEmail, expiresInDays: 7 }),
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token: string };
		expect(body.token.length).toBeGreaterThan(20);
		token = body.token;
	});

	it("public preview returns PENDING", async () => {
		const res = await app.handle(new Request(`http://localhost/invitations/${token}`));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; role: string };
		expect(body.status).toBe("PENDING");
		expect(body.role).toBe("MASTER");
	});

	it("redeems the invitation: creates user + membership + master profile", async () => {
		const res = await app.handle(
			new Request(`http://localhost/invitations/${token}/redeem`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Master Joe",
					email: inviteeEmail,
					password,
					displayName: "Joe",
					phone: "+1-555-1212",
					specializations: ["electrician"],
				}),
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; userId: string; role: string };
		expect(body.ok).toBe(true);
		expect(body.role).toBe("MASTER");

		// Verify masterProfile exists in tenant schema.
		const profiles = await db.execute(
			dsql.raw(
				`SELECT display_name, phone, specializations FROM "${schemaName}".master_profiles WHERE user_id = '${body.userId}'`,
			),
		);
		expect(profiles.length).toBe(1);
		expect((profiles[0] as { display_name: string }).display_name).toBe("Joe");
	});

	it("second redemption with the same token fails", async () => {
		const res = await app.handle(
			new Request(`http://localhost/invitations/${token}/redeem`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Another",
					email: `other-${SUFFIX}@example.test`,
					password,
				}),
			}),
		);
		expect(res.status).toBe(409);
	});

	it("preview on a consumed token returns 404 (no tenant-name leak)", async () => {
		const res = await app.handle(new Request(`http://localhost/invitations/${token}`));
		expect(res.status).toBe(404);
	});

	it("revoke on a consumed token returns 409", async () => {
		const res = await app.handle(
			new Request(`http://localhost/owner/invitations/${token}`, {
				method: "DELETE",
				headers: { cookie: ownerCookie },
			}),
		);
		expect(res.status).toBe(409);
	});

	it("owner roster shows the new master with rating null", async () => {
		const res = await app.handle(
			new Request("http://localhost/owner/masters", {
				headers: { cookie: ownerCookie },
			}),
		);
		expect(res.status).toBe(200);
		const rows = (await res.json()) as Array<{
			displayName: string;
			specializations: string[];
			rating: unknown;
		}>;
		expect(rows.length).toBe(1);
		expect(rows[0]?.displayName).toBe("Joe");
		expect(rows[0]?.specializations).toEqual(["electrician"]);
		expect(rows[0]?.rating).toBeNull();
	});
});
