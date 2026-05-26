#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { createDbClient } from "@repo/db/client";
import { user as userTable } from "@repo/db/schema/control";
import { sql as dsql, eq } from "drizzle-orm";

const { values } = parseArgs({
	options: {
		email: { type: "string" },
		demote: { type: "boolean" },
	},
});

if (!values.email) {
	console.error("Missing required --email");
	process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

// Gate: anyone with DATABASE_URL must NOT be able to silently promote
// themselves once the system has a super-admin. The script accepts two modes:
//   1. Bootstrap: no super-admin exists yet — first call wins.
//   2. Authorized: SUPER_ADMIN_BOOTSTRAP_TOKEN env matches BOOTSTRAP_TOKEN
//      (operator-only secret). Demotion always requires this token.
const bootstrapToken = process.env.BOOTSTRAP_TOKEN;
const providedToken = process.env.SUPER_ADMIN_BOOTSTRAP_TOKEN;

const { db, sql } = createDbClient(url);
try {
	const [{ count }] = await db
		.select({ count: dsql<number>`count(*)::int` })
		.from(userTable)
		.where(eq(userTable.isSuperAdmin, true));
	const hasExistingSuperAdmin = (count ?? 0) > 0;
	const tokenOk = !!bootstrapToken && !!providedToken && bootstrapToken === providedToken;

	if (values.demote && !tokenOk) {
		console.error("Demotion requires SUPER_ADMIN_BOOTSTRAP_TOKEN env to match BOOTSTRAP_TOKEN.");
		process.exit(1);
	}
	if (!values.demote && hasExistingSuperAdmin && !tokenOk) {
		console.error(
			"A super-admin already exists. Set SUPER_ADMIN_BOOTSTRAP_TOKEN env to match BOOTSTRAP_TOKEN to promote additional super-admins.",
		);
		process.exit(1);
	}

	const target = !values.demote;
	const [row] = await db
		.update(userTable)
		.set({ isSuperAdmin: target })
		.where(eq(userTable.email, values.email))
		.returning({ id: userTable.id, email: userTable.email, isSuperAdmin: userTable.isSuperAdmin });
	if (!row) {
		console.error(`No user with email ${values.email}`);
		process.exit(1);
	}
	console.log(JSON.stringify(row, null, 2));
} finally {
	await sql.end();
}
