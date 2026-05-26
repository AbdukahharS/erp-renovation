import * as control from "@repo/db/schema/control";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db.ts";

const secret = process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-please-32+chars";
const trustedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

const isProd = process.env.NODE_ENV === "production";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: control.user,
			session: control.session,
			account: control.account,
			verification: control.verification,
		},
	}),
	secret,
	// Phase 9: enforce a minimum password length so the bootstrap path and
	// per-tenant invitations can't seed accounts with weak credentials.
	emailAndPassword: { enabled: true, minPasswordLength: 12 },
	trustedOrigins,
	// Secure cookies in prod; sameSite=lax keeps OAuth flows working while
	// blocking cross-site form posts. Better Auth defaults work in dev.
	advanced: isProd
		? {
				cookies: {
					sessionToken: {
						attributes: { secure: true, sameSite: "lax", httpOnly: true },
					},
				},
			}
		: undefined,
	session: {
		additionalFields: {
			activeTenantId: { type: "string", required: false, input: false },
			activeRole: { type: "string", required: false, input: false },
		},
	},
});

export type Auth = typeof auth;
