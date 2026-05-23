import type { Role } from "@repo/validators";
import { Elysia } from "elysia";
import { auth } from "./auth.ts";

export class AuthError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

/**
 * Resolves the Better Auth session from request headers and attaches
 * `user`, `session`, `activeTenantId`, `activeRole` to the Elysia context.
 * Does NOT 401 on its own — handlers (or `requireAuth`) decide.
 */
export const authContext = new Elysia({ name: "auth-context" }).derive(
	{ as: "global" },
	async ({ request }) => {
		const result = await auth.api.getSession({ headers: request.headers });
		if (!result) {
			return {
				user: null,
				session: null,
				activeTenantId: null as string | null,
				activeRole: null as Role | null,
			};
		}
		const { user, session } = result;
		const activeTenantId =
			(session as unknown as { activeTenantId?: string | null }).activeTenantId ?? null;
		const activeRole =
			((session as unknown as { activeRole?: Role | null }).activeRole as Role | null) ?? null;
		return { user, session, activeTenantId, activeRole };
	},
);

export const requireAuth = new Elysia({ name: "require-auth" })
	.use(authContext)
	.onBeforeHandle(({ user, set }) => {
		if (!user) {
			set.status = 401;
			return { error: "unauthorized" };
		}
	});

export function requireRole(...allowed: Role[]) {
	return new Elysia({ name: `require-role:${allowed.join(",")}` })
		.use(authContext)
		.onBeforeHandle(({ user, activeRole, set }) => {
			if (!user) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			if (!activeRole || !allowed.includes(activeRole)) {
				set.status = 403;
				return { error: "forbidden" };
			}
		});
}
