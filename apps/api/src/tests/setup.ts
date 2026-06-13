import { afterAll } from "bun:test";
import { sql } from "../db.ts";
import { wireTestJobRunner } from "./job-runner.ts";

// Subscribe the in-process worker runner so tests don't need a live Redis.
// See job-runner.ts for the flush helper.
wireTestJobRunner();

// Sweep leftover test tenants from prior runs. Per-file afterAll cleanup is
// fragile (Ctrl-C, partial beforeAll failure, DROP SCHEMA blocked by an
// in-flight connection), so we self-heal at the start of every run. Test
// tenants are identified by the SUFFIX shape every test file uses:
// `<name> <Date.now()>-<6 alnum>`. Real tenants don't match this.
// Matches e.g. "AccA 1780809845493-qdcbgu" — the SUFFIX shape every test uses.
const TEST_NAME_REGEX = " [0-9]{10,}-[a-z0-9]{6}$";
const rows = await sql<{ id: string; schema_name: string }[]>`
	SELECT id, schema_name FROM tenants WHERE name ~ ${TEST_NAME_REGEX}
`;
for (const { schema_name } of rows) {
	await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`);
}
if (rows.length > 0) {
	await sql`DELETE FROM tenants WHERE id IN ${sql(rows.map((r) => r.id))}`;
}
// Drop orphan tenant schemas whose tenants row was already deleted but whose
// DROP SCHEMA was skipped (e.g. cleanup ordering, blocked connection).
const orphanSchemas = await sql<{ schema_name: string }[]>`
	SELECT s.schema_name
	FROM information_schema.schemata s
	LEFT JOIN tenants t ON t.schema_name = s.schema_name
	WHERE s.schema_name LIKE 'tenant\\_%' ESCAPE '\\' AND t.id IS NULL
`;
for (const { schema_name } of orphanSchemas) {
	await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema_name}" CASCADE`);
}

// Single owner of the shared postgres connection lifecycle across test files.
// Without this, each test file's afterAll used to .end() the shared client,
// breaking subsequent files. Now files only do their own row/schema cleanup;
// this preload closes the connection once at process exit.
afterAll(async () => {
	await sql.end();
});
