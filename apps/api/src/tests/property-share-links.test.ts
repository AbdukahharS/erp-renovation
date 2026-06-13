import { afterAll, beforeAll, describe, expect, it } from "bun:test";

process.env.SHARE_LINK_JWT_SECRET ??= "test-share-link-secret-1234567890";
process.env.PUBLIC_APP_URL ??= "http://localhost:3000";

import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import { propertyShareLinks } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { sql as dsql, eq } from "drizzle-orm";
import { db } from "../db.ts";
import { app } from "../index.ts";

function must<T>(v: T | undefined | null, msg = "expected value"): T {
	if (v === undefined || v === null) throw new Error(msg);
	return v;
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `owner-share-a-${SUFFIX}@example.test`;
const bOwnerEmail = `owner-share-b-${SUFFIX}@example.test`;
const password = "test-password-123";

let aOwnerCookie = "";
let bOwnerCookie = "";
let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";
let aTenantSlug = "";
let bTenantSlug = "";

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

async function pub(path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
	return await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
}

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

async function createProperty(cookie: string): Promise<string> {
	const templateId = await defaultTemplateId(cookie);
	const res = await call(cookie, "/properties", {
		method: "POST",
		body: JSON.stringify({
			name: `Share ${SUFFIX}`,
			address: "1 Share Way",
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

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	aTenantSlug = `share-a-${SUFFIX}`;
	bTenantSlug = `share-b-${SUFFIX}`;
	const a = await provision(`ShareA ${SUFFIX}`, aTenantSlug, aOwnerEmail);
	const b = await provision(`ShareB ${SUFFIX}`, bTenantSlug, bOwnerEmail);
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
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(userTable).where(dsql`email IN (${aOwnerEmail}, ${bOwnerEmail})`);
});

describe("property share links — owner CRUD", () => {
	it("creates a link, stores a hashed password, and lists it", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const linkPwd = "customer-pwd-1";
		const createRes = await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
			method: "POST",
			body: JSON.stringify({ password: linkPwd }),
		});
		expect(createRes.status).toBe(200);
		const created = (await createRes.json()) as { id: string; slug: string; url: string };
		expect(created.slug.length).toBeGreaterThanOrEqual(8);
		expect(created.url).toContain(`/p/${aTenantSlug}/${created.slug}`);

		// Hash is not the plaintext.
		const [row] = await withTenant(db, aSchema, (tx) =>
			tx
				.select({ passwordHash: propertyShareLinks.passwordHash })
				.from(propertyShareLinks)
				.where(eq(propertyShareLinks.id, created.id))
				.limit(1),
		);
		expect(must(row).passwordHash).not.toBe(linkPwd);
		expect(must(row).passwordHash.length).toBeGreaterThan(20);

		const listRes = await call(aOwnerCookie, `/properties/${propertyId}/share-links`);
		expect(listRes.status).toBe(200);
		const list = (await listRes.json()) as Array<{ id: string; slug: string; url: string }>;
		const found = list.find((l) => l.id === created.id);
		expect(found).toBeTruthy();
		// The list returns the full public URL with the tenant slug embedded.
		expect(found?.url).toContain(`/p/${aTenantSlug}/${created.slug}`);
		// The list never returns the password hash.
		expect((list[0] as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
	});

	it("rejects share-link creation on another tenant's property (404)", async () => {
		const aProp = await createProperty(aOwnerCookie);
		const res = await call(bOwnerCookie, `/properties/${aProp}/share-links`, {
			method: "POST",
			body: JSON.stringify({ password: "pwd-1234" }),
		});
		expect(res.status).toBe(404);
	});

	it("revokes a link", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const created = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: "to-be-revoked" }),
			})
		).json()) as { id: string };

		const revokeRes = await call(
			aOwnerCookie,
			`/properties/${propertyId}/share-links/${created.id}/revoke`,
			{ method: "POST" },
		);
		expect(revokeRes.status).toBe(200);

		const [row] = await withTenant(db, aSchema, (tx) =>
			tx
				.select({ revokedAt: propertyShareLinks.revokedAt })
				.from(propertyShareLinks)
				.where(eq(propertyShareLinks.id, created.id))
				.limit(1),
		);
		expect(must(row).revokedAt).not.toBeNull();
	});
});

describe("property share links — public auth + view", () => {
	it("authenticates with correct password and returns sanitized view (no money)", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const linkPwd = "customer-view-pwd";
		const link = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: linkPwd }),
			})
		).json()) as { slug: string };

		const authRes = await pub(`/public/property-share/${aTenantSlug}/${link.slug}/auth`, {
			method: "POST",
			body: JSON.stringify({ password: linkPwd }),
		});
		expect(authRes.status).toBe(200);
		const { token } = (await authRes.json()) as { token: string };
		expect(token.split(".").length).toBe(3);

		const viewRes = await pub("/public/property-share/view", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(viewRes.status).toBe(200);
		const view = (await viewRes.json()) as Record<string, unknown> & {
			property: Record<string, unknown>;
			stages: Array<Record<string, unknown>>;
		};

		// Sensitive fields must not appear anywhere in the payload.
		const serialized = JSON.stringify(view);
		expect(serialized.includes("wageAmount")).toBe(false);
		expect(serialized.includes("plannedUnitCost")).toBe(false);
		expect(serialized.includes("masterUserId")).toBe(false);

		// Property metadata is present.
		expect(view.property.name).toContain("Share ");
		expect(view.property.areaSqm).toBe("10.00");

		// Each stage has the expected progress shape.
		expect(view.stages.length).toBeGreaterThan(0);
		const first = view.stages[0] as { progressPct: number; subStages: unknown[] };
		expect(typeof first.progressPct).toBe("number");
		expect(Array.isArray(first.subStages)).toBe(true);
	});

	it("rejects wrong password with 401", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const link = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: "the-real-one" }),
			})
		).json()) as { slug: string };

		const res = await pub(`/public/property-share/${aTenantSlug}/${link.slug}/auth`, {
			method: "POST",
			body: JSON.stringify({ password: "wrong-password" }),
		});
		expect(res.status).toBe(401);
	});

	it("rejects auth on a revoked link", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const linkPwd = "revoke-then-auth";
		const link = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: linkPwd }),
			})
		).json()) as { id: string; slug: string };

		await call(aOwnerCookie, `/properties/${propertyId}/share-links/${link.id}/revoke`, {
			method: "POST",
		});

		const res = await pub(`/public/property-share/${aTenantSlug}/${link.slug}/auth`, {
			method: "POST",
			body: JSON.stringify({ password: linkPwd }),
		});
		expect(res.status).toBe(401);
	});

	it("returns 404 for a tenant slug that doesn't exist", async () => {
		const res = await pub(`/public/property-share/no-such-tenant/abcdefgh/auth`, {
			method: "POST",
			body: JSON.stringify({ password: "whatever" }),
		});
		expect(res.status).toBe(404);
	});

	it("returns 401 when the link slug doesn't exist in that tenant", async () => {
		const res = await pub(`/public/property-share/${aTenantSlug}/zzz-no-link-zzz/auth`, {
			method: "POST",
			body: JSON.stringify({ password: "whatever" }),
		});
		expect(res.status).toBe(401);
	});

	it("invalidates issued tokens when the password is rotated", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const link = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: "first-pwd" }),
			})
		).json()) as { id: string; slug: string };

		const authRes = await pub(`/public/property-share/${aTenantSlug}/${link.slug}/auth`, {
			method: "POST",
			body: JSON.stringify({ password: "first-pwd" }),
		});
		const { token } = (await authRes.json()) as { token: string };

		// Bump updated_at directly so the rotation is observable even at 1-second
		// timestamp resolution (a same-second rotate would leave pwUpdatedAt equal).
		await withTenant(db, aSchema, (tx) =>
			tx
				.update(propertyShareLinks)
				.set({ updatedAt: new Date(Date.now() + 5_000) })
				.where(eq(propertyShareLinks.id, link.id)),
		);

		const viewRes = await pub("/public/property-share/view", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(viewRes.status).toBe(401);
	});

	it("rejects /view without a bearer token", async () => {
		const res = await pub("/public/property-share/view");
		expect(res.status).toBe(401);
	});

	it("rejects /view with a tampered token", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const link = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: "tamper-pwd" }),
			})
		).json()) as { slug: string };
		const authRes = await pub(`/public/property-share/${aTenantSlug}/${link.slug}/auth`, {
			method: "POST",
			body: JSON.stringify({ password: "tamper-pwd" }),
		});
		const { token } = (await authRes.json()) as { token: string };
		const tampered = `${token.slice(0, -2)}AA`;
		const res = await pub("/public/property-share/view", {
			headers: { authorization: `Bearer ${tampered}` },
		});
		expect(res.status).toBe(401);
	});

	it("does not let tenant B's slug + tenant A's link slug succeed (404/401)", async () => {
		const propertyId = await createProperty(aOwnerCookie);
		const link = (await (
			await call(aOwnerCookie, `/properties/${propertyId}/share-links`, {
				method: "POST",
				body: JSON.stringify({ password: "cross-tenant" }),
			})
		).json()) as { slug: string };

		const res = await pub(`/public/property-share/${bTenantSlug}/${link.slug}/auth`, {
			method: "POST",
			body: JSON.stringify({ password: "cross-tenant" }),
		});
		// Tenant B's schema has no row with that slug — the lookup returns null
		// and the route 401s. (404 would also be acceptable; both gate access.)
		expect([401, 404]).toContain(res.status);
	});
});
