import { sql as dsql } from "drizzle-orm";
import type { DbClient } from "./client.ts";

/**
 * Run `fn` inside a transaction with `search_path` scoped to the tenant's schema.
 * `SET LOCAL` is transaction-bound, so the connection returned to the pool
 * cannot leak the modified search_path to a later request.
 */
export async function withTenant<T>(
	db: DbClient,
	schemaName: string,
	fn: (tx: Parameters<Parameters<DbClient["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
	if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
		throw new Error(`unsafe schema name: ${schemaName}`);
	}
	return await db.transaction(async (tx) => {
		await tx.execute(dsql.raw(`SET LOCAL search_path = "${schemaName}", public`));
		return await fn(tx);
	});
}
