import { user as userTable } from "@repo/db/schema/control";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { authContext } from "../auth/guards.ts";

/**
 * Phase 9 gate for `/admin/*` routes. Requires a logged-in user whose
 * `is_super_admin` flag is true. The BOOTSTRAP_TOKEN path on `POST /tenants`
 * remains as the only way to seed the very first super-admin; after that,
 * the promote-super-admin script (or another super-admin) is the only route.
 */
export const requireSuperAdmin = new Elysia({ name: "require-super-admin" })
	.use(authContext)
	.derive({ as: "scoped" }, async ({ user, set }) => {
		if (!user) {
			set.status = 401;
			return { superAdminUser: null };
		}
		const [row] = await db
			.select({ isSuperAdmin: userTable.isSuperAdmin })
			.from(userTable)
			.where(eq(userTable.id, user.id))
			.limit(1);
		if (!row?.isSuperAdmin) {
			set.status = 403;
			return { superAdminUser: null };
		}
		return { superAdminUser: user };
	})
	.onBeforeHandle({ as: "scoped" }, ({ superAdminUser, set }) => {
		if (!superAdminUser) {
			if (set.status !== 401 && set.status !== 403) set.status = 403;
			return { error: "forbidden" };
		}
	});
