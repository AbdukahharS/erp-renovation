import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as control from "./schema/control.ts";
import * as tenant from "./schema/tenant.ts";

const fullSchema = { ...control, ...tenant };

export function createPgClient(connectionString: string) {
	// `prepare: false` keeps each connection statement-cache-free, which avoids
	// stale plans across schema switches when we toggle search_path per request.
	return postgres(connectionString, { prepare: false });
}

export function createDbClient(connectionString: string) {
	const sql = createPgClient(connectionString);
	const db = drizzle(sql, { schema: fullSchema });
	return { db, sql };
}

export type PgClient = ReturnType<typeof createPgClient>;
export type DbBundle = ReturnType<typeof createDbClient>;
export type DbClient = DbBundle["db"];
