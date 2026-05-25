import { afterAll } from "bun:test";
import { sql } from "../db.ts";
import { wireTestJobRunner } from "./job-runner.ts";

// Subscribe the in-process worker runner so tests don't need a live Redis.
// See job-runner.ts for the flush helper.
wireTestJobRunner();

// Single owner of the shared postgres connection lifecycle across test files.
// Without this, each test file's afterAll used to .end() the shared client,
// breaking subsequent files. Now files only do their own row/schema cleanup;
// this preload closes the connection once at process exit.
afterAll(async () => {
	await sql.end();
});
