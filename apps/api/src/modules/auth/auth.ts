import * as control from "@repo/db/schema/control";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../db.ts";

const secret = process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-please-32+chars";
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
	emailAndPassword: { enabled: true },
	trustedOrigins,
	session: {
		additionalFields: {
			activeTenantId: { type: "string", required: false, input: false },
			activeRole: { type: "string", required: false, input: false },
		},
	},
});

export type Auth = typeof auth;
