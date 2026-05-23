import { tenants } from "@repo/db/schema/control";
import { withTenant } from "@repo/db/with-tenant";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { authContext } from "../auth/guards.ts";

/**
 * Resolves the active tenant from the session and exposes a helper that
 * runs a callback inside a transaction with `search_path` scoped to that
 * tenant's schema. Use `runInTenant(fn)` in handlers needing tenant-scoped queries.
 *
 * 401 if no session; 409 if session has no active tenant set.
 */
export const tenancy = new Elysia({ name: "tenancy" })
	.use(authContext)
	.derive({ as: "scoped" }, async ({ user, activeTenantId, activeRole, set }) => {
		if (!user || !activeTenantId) return { tenant: null, runInTenant: null };
		const [t] = await db
			.select({ id: tenants.id, schemaName: tenants.schemaName, status: tenants.status })
			.from(tenants)
			.where(eq(tenants.id, activeTenantId))
			.limit(1);
		if (!t || t.status !== "ACTIVE") {
			set.status = 409;
			return { tenant: null, runInTenant: null };
		}
		const tenant = { id: t.id, schemaName: t.schemaName, role: activeRole };
		return {
			tenant,
			runInTenant: <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, t.schemaName, fn),
		};
	})
	.onBeforeHandle({ as: "scoped" }, ({ tenant, set }) => {
		if (!tenant) {
			set.status = set.status === 200 ? 401 : set.status;
			return { error: "no active tenant" };
		}
	});
