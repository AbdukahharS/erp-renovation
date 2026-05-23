import { provisionTenant } from "@repo/db/provision";
import { tenantMemberships, user as userTable } from "@repo/db/schema/control";
import { CreateTenantSchema } from "@repo/validators";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db, dbUrl } from "../../db.ts";
import { auth } from "../auth/auth.ts";

/**
 * Tenant provisioning. Gated by `BOOTSTRAP_TOKEN` header until Phase 9
 * adds a real super-admin role + UI. Intended for the CLI script and
 * controlled admin tooling.
 */
export const tenantRoutes = new Elysia().post(
	"/tenants",
	async ({ body, headers, set }) => {
		const expected = process.env.BOOTSTRAP_TOKEN;
		if (!expected || headers["x-bootstrap-token"] !== expected) {
			set.status = 401;
			return { error: "bootstrap token required" };
		}
		const parsed = CreateTenantSchema.safeParse(body);
		if (!parsed.success) {
			set.status = 400;
			return { error: "invalid body", issues: parsed.error.flatten() };
		}

		// 1. Create the Owner user via Better Auth (idempotent if email exists -> error).
		const existing = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.email, parsed.data.ownerEmail))
			.limit(1);
		let ownerUserId: string;
		if (existing[0]) {
			ownerUserId = existing[0].id;
		} else {
			const signUp = await auth.api.signUpEmail({
				body: {
					email: parsed.data.ownerEmail,
					password: parsed.data.ownerPassword,
					name: parsed.data.ownerName,
				},
			});
			ownerUserId = signUp.user.id;
		}

		// 2. Provision schema + tenant row + membership.
		const result = await provisionTenant(db, {
			name: parsed.data.name,
			slug: parsed.data.slug,
			ownerUserId,
			connectionString: dbUrl,
		});

		// Ensure membership row exists if user was pre-existing.
		await db
			.insert(tenantMemberships)
			.values({ userId: ownerUserId, tenantId: result.id, role: "OWNER" })
			.onConflictDoNothing();

		return { tenantId: result.id, schemaName: result.schemaName, ownerUserId };
	},
	{
		body: t.Object({
			name: t.String(),
			slug: t.String(),
			ownerEmail: t.String(),
			ownerName: t.String(),
			ownerPassword: t.String(),
		}),
	},
);
