import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { tenantMemberships, tenants, user as userTable } from "@repo/db/schema/control";
import { notificationIntents, notifications, pushSubscriptions } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { sql as dsql, eq } from "drizzle-orm";
import { processNotificationDispatch } from "../../../worker/src/jobs/notification-dispatch.ts";
import { db } from "../db.ts";
import { app } from "../index.ts";
import { auth } from "../modules/auth/auth.ts";

/**
 * Phase 8 notifications tests. Covers:
 *  - dispatch produces an in-app notification row (and is idempotent)
 *  - intent.status flips to SENT with notificationId set
 *  - cross-tenant isolation: tenant A user cannot see / mutate tenant B rows
 *  - push subscription endpoint binds to the caller, not the body's userId
 */

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const aOwnerEmail = `n-owner-a-${SUFFIX}@example.test`;
const bOwnerEmail = `n-owner-b-${SUFFIX}@example.test`;
const aMasterEmail = `n-master-a-${SUFFIX}@example.test`;
const bMasterEmail = `n-master-b-${SUFFIX}@example.test`;
const password = "test-password-123";

let aTenantId = "";
let bTenantId = "";
let aSchema = "";
let bSchema = "";
let aMasterUserId = "";
let bMasterUserId = "";
let aMasterCookie = "";
let bMasterCookie = "";

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

async function signUpAs(email: string, role: "INSPECTOR" | "MASTER", tenantId: string) {
	const r = await auth.api.signUpEmail({ body: { email, password, name: email } });
	const userId = r.user.id;
	await db.insert(tenantMemberships).values({ userId, tenantId, role });
	return userId;
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

async function call(cookie: string, path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookie);
	if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
	return await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
}

beforeAll(async () => {
	process.env.BOOTSTRAP_TOKEN = process.env.BOOTSTRAP_TOKEN ?? "test-bootstrap";
	const a = await provision(`NotifA ${SUFFIX}`, `notif-a-${SUFFIX}`, aOwnerEmail);
	const b = await provision(`NotifB ${SUFFIX}`, `notif-b-${SUFFIX}`, bOwnerEmail);
	aTenantId = a.tenantId;
	bTenantId = b.tenantId;
	aSchema = a.schemaName;
	bSchema = b.schemaName;
	aMasterUserId = await signUpAs(aMasterEmail, "MASTER", aTenantId);
	bMasterUserId = await signUpAs(bMasterEmail, "MASTER", bTenantId);
	aMasterCookie = await loginAndSwitch(aMasterEmail, aTenantId);
	bMasterCookie = await loginAndSwitch(bMasterEmail, bTenantId);
});

afterAll(async () => {
	const userIds = [aMasterUserId, bMasterUserId].filter(Boolean);
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${aSchema}" CASCADE`));
	await db.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${bSchema}" CASCADE`));
	await db.delete(tenantMemberships).where(dsql`tenant_id IN (${aTenantId}, ${bTenantId})`);
	await db.delete(tenants).where(dsql`id IN (${aTenantId}, ${bTenantId})`);
	if (userIds.length > 0) {
		await db.delete(userTable).where(dsql`id IN (${dsql.join(userIds, dsql`, `)})`);
	}
});

describe("phase 8 notification dispatch", () => {
	it("creates an in-app notification row and marks the intent SENT", async () => {
		// Seed a standalone intent (no real stage required for the dispatch unit).
		const intentId = await withTenant(db, aSchema, async (tx) => {
			const [row] = await tx
				.insert(notificationIntents)
				.values({
					type: "STAGE_AVAILABLE",
					targetUserId: aMasterUserId,
					subStageInstanceId: null,
					propertyId: null,
					payload: { specialization: "Electrician" },
				})
				.returning({ id: notificationIntents.id });
			return row?.id ?? "";
		});
		expect(intentId).not.toBe("");

		const result = await processNotificationDispatch({
			data: { tenantSchema: aSchema, notificationIntentId: intentId },
		});
		expect(result.notificationId).not.toBeNull();

		await withTenant(db, aSchema, async (tx) => {
			const [intent] = await tx
				.select()
				.from(notificationIntents)
				.where(eq(notificationIntents.id, intentId));
			expect(intent?.status).toBe("SENT");
			expect(intent?.notificationId).toBe(result.notificationId);
			const rows = await tx
				.select()
				.from(notifications)
				.where(eq(notifications.intentId, intentId));
			expect(rows.length).toBe(1);
			expect(rows[0]?.recipientUserId).toBe(aMasterUserId);
		});

		// Re-running the dispatcher must NOT create a second notification row
		// (idempotency via the partial unique index on intent_id).
		const second = await processNotificationDispatch({
			data: { tenantSchema: aSchema, notificationIntentId: intentId },
		});
		expect(second.notificationId).toBe(result.notificationId);
		await withTenant(db, aSchema, async (tx) => {
			const rows = await tx
				.select()
				.from(notifications)
				.where(eq(notifications.intentId, intentId));
			expect(rows.length).toBe(1);
		});
	});
});

describe("phase 8 notifications API isolation", () => {
	it("listing notifications is scoped to the calling user; cross-tenant rows are invisible", async () => {
		// Plant a notification for tenant B's master.
		await withTenant(db, bSchema, async (tx) => {
			await tx.insert(notifications).values({
				recipientUserId: bMasterUserId,
				type: "STAGE_AVAILABLE",
				title: "B-only",
				body: "should never leak to A",
				targetUrl: null,
			});
		});

		// Plant one for A's master via the dispatcher.
		const aIntentId = await withTenant(db, aSchema, async (tx) => {
			const [row] = await tx
				.insert(notificationIntents)
				.values({
					type: "STAGE_AVAILABLE",
					targetUserId: aMasterUserId,
					payload: null,
				})
				.returning({ id: notificationIntents.id });
			return row?.id ?? "";
		});
		await processNotificationDispatch({
			data: { tenantSchema: aSchema, notificationIntentId: aIntentId },
		});

		const aRes = await call(aMasterCookie, "/tenant/notifications/");
		expect(aRes.status).toBe(200);
		const aBody = (await aRes.json()) as {
			items: Array<{ recipientUserId?: string; body: string }>;
		};
		expect(aBody.items.some((i) => i.body === "should never leak to A")).toBe(false);

		const bRes = await call(bMasterCookie, "/tenant/notifications/");
		expect(bRes.status).toBe(200);
		const bBody = (await bRes.json()) as { items: Array<{ body: string }> };
		expect(bBody.items.some((i) => i.body === "should never leak to A")).toBe(true);
	});

	it("push subscription POST binds endpoint to the caller's userId", async () => {
		const endpoint = `https://fcm.googleapis.com/fcm/send/test-${SUFFIX}`;
		const body = JSON.stringify({
			endpoint,
			keys: { p256dh: "fakekey", auth: "fakeauth" },
			userAgent: "bun-test",
		});
		const res = await call(aMasterCookie, "/tenant/notifications/subscriptions", {
			method: "POST",
			body,
		});
		expect(res.status).toBe(200);

		await withTenant(db, aSchema, async (tx) => {
			const [row] = await tx
				.select()
				.from(pushSubscriptions)
				.where(eq(pushSubscriptions.endpoint, endpoint));
			expect(row?.userId).toBe(aMasterUserId);
		});
	});

	it("mark-read only flips the caller's own rows", async () => {
		const res = await call(aMasterCookie, "/tenant/notifications/mark-read", {
			method: "POST",
			body: JSON.stringify({ all: true }),
		});
		expect(res.status).toBe(200);

		// Tenant B notifications still unread.
		await withTenant(db, bSchema, async (tx) => {
			const rows = await tx
				.select()
				.from(notifications)
				.where(eq(notifications.recipientUserId, bMasterUserId));
			expect(rows.length).toBeGreaterThan(0);
			expect(rows.every((r) => r.readAt === null)).toBe(true);
		});
	});
});
