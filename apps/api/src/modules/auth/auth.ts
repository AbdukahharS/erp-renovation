import * as control from "@repo/db/schema/control";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db.ts";

const isProd = process.env.NODE_ENV === "production";

function resolveSecret(): string {
	const fromEnv = process.env.BETTER_AUTH_SECRET;
	if (!fromEnv) {
		throw new Error("BETTER_AUTH_SECRET is required");
	}
	if (fromEnv.length < 32) {
		throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
	}
	return fromEnv;
}

const secret = resolveSecret();
const trustedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

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
