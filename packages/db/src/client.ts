import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDbClient(connectionString: string) {
	const sql = postgres(connectionString);
	return drizzle(sql);
}

export type DbClient = ReturnType<typeof createDbClient>;
