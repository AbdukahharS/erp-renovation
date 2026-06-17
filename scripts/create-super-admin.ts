#!/usr/bin/env bun
/**
 * Creates a standalone superadmin account with no tenant membership.
 *
 * Usage:
 *   bun scripts/create-super-admin.ts --email admin@example.com --name "Admin" --password "securepassword123"
 *
 * Security gate (same as promote-super-admin.ts):
 *   - First call succeeds with no token (bootstrap).
 *   - Subsequent calls require SUPER_ADMIN_BOOTSTRAP_TOKEN=<BOOTSTRAP_TOKEN>.
 */
import { parseArgs } from "node:util";
import { createDbClient } from "@repo/db/client";
import { account as accountTable, user as userTable } from "@repo/db/schema/control";
import { hashPassword } from "@better-auth/utils/password";
import { eq } from "drizzle-orm";

const { values } = parseArgs({
	options: {
		email: { type: "string" },
		name: { type: "string" },
		password: { type: "string" },
	},
});

if (!values.email || !values.name || !values.password) {
	console.error("Usage: bun scripts/create-super-admin.ts --email <email> --name <name> --password <password>");
	process.exit(1);
}

if (values.password.length < 12) {
	console.error("Password must be at least 12 characters.");
	process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
const providedToken = process.env.SUPER_ADMIN_BOOTSTRAP_TOKEN;
const tokenOk = !!bootstrapToken && !!providedToken && bootstrapToken === providedToken;

const { db, sql } = createDbClient(url);

try {
	// Security gate: allow the first superadmin freely, require a token for subsequent ones.
	const existing = await db
		.select({ id: userTable.id, isSuperAdmin: userTable.isSuperAdmin })
		.from(userTable)
		.where(eq(userTable.isSuperAdmin, true))
		.limit(1);

	if (existing.length > 0 && !tokenOk) {
		console.error(
			"A superadmin already exists. Set SUPER_ADMIN_BOOTSTRAP_TOKEN env to match BOOTSTRAP_TOKEN to create additional superadmins.",
		);
		process.exit(1);
	}

	// Check the email isn't already taken.
	const [taken] = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, values.email))
		.limit(1);

	if (taken) {
		console.error(`A user with email ${values.email} already exists. Use promote-super-admin.ts to promote them.`);
		process.exit(1);
	}

	const userId = crypto.randomUUID();
	const accountId = crypto.randomUUID();
	const hashedPassword = await hashPassword(values.password!);
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx.insert(userTable).values({
			id: userId,
			email: values.email!,
			name: values.name!,
			emailVerified: true,
			isSuperAdmin: true,
			createdAt: now,
			updatedAt: now,
		});

		await tx.insert(accountTable).values({
			id: accountId,
			accountId: userId,
			providerId: "credential",
			userId,
			password: hashedPassword,
			createdAt: now,
			updatedAt: now,
		});
	});

	console.log(JSON.stringify({ id: userId, email: values.email, name: values.name, isSuperAdmin: true }, null, 2));
} finally {
	await sql.end();
}
