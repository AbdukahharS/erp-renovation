import { session as sessionTable, tenantMemberships, tenants } from "@repo/db/schema/control";
import { SwitchTenantSchema } from "@repo/validators";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db.ts";
import { auth } from "./auth.ts";
import { authContext, requireAuth } from "./guards.ts";

/**
 * Mounts:
 *  - `/api/auth/*` — Better Auth handler (sign-in, sign-up, sign-out, etc.).
 *  - `GET /auth/me` — current user, memberships, active tenant + role.
 *  - `POST /auth/switch-tenant` — pick which membership to act under.
 */
export const authRoutes = new Elysia()
	.use(authContext)
	// Better Auth handler — its default basePath is /api/auth.
	.all("/api/auth/*", async ({ request }) => auth.handler(request))
	.use(requireAuth)
	.get("/auth/me", async ({ user, activeTenantId, activeRole }) => {
		if (!user) return { user: null, memberships: [], activeTenantId: null, activeRole: null };
		const memberships = await db
			.select({
				tenantId: tenants.id,
				tenantSlug: tenants.slug,
				tenantName: tenants.name,
				role: tenantMemberships.role,
			})
			.from(tenantMemberships)
			.innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
			.where(eq(tenantMemberships.userId, user.id));
		return {
			user: { id: user.id, email: user.email, name: user.name },
			memberships,
			activeTenantId,
			activeRole,
		};
	})
	.post(
		"/auth/switch-tenant",
		async ({ body, user, session, set }) => {
			if (!user || !session) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			const [membership] = await db
				.select({ role: tenantMemberships.role })
				.from(tenantMemberships)
				.where(
					and(eq(tenantMemberships.userId, user.id), eq(tenantMemberships.tenantId, body.tenantId)),
				)
				.limit(1);
			if (!membership) {
				set.status = 403;
				return { error: "no membership for tenant" };
			}
			await db
				.update(sessionTable)
				.set({ activeTenantId: body.tenantId, activeRole: membership.role })
				.where(eq(sessionTable.id, session.id));
			return { ok: true, tenantId: body.tenantId, role: membership.role };
		},
		{ body: t.Object({ tenantId: t.String() }) },
	);

// Validate the body shape against the Zod schema as well; Elysia's `t` is
// the structural gate, then we double-check with Zod inside the handler if
// stricter rules are needed. SwitchTenantSchema lives in @repo/validators
// for the web client's RHF/form usage.
void SwitchTenantSchema;
