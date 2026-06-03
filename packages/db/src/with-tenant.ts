import { sql as dsql } from "drizzle-orm";
import type { DbClient } from "./client.ts";

/**
 * The transaction handle Drizzle hands to `db.transaction(fn)` callbacks —
 * the same value `withTenant`/`runInTenant` passes to its callback.
 * Exposed so services can type their `tx` parameter without falling back to `any`.
 */
export type TenantTx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/**
 * Per-transaction queue of side-effects to run only AFTER the outer tx commits.
 * Used to defer domain-event emission so handlers/subscribers never read a
 * not-yet-committed write (race that breaks the in-process worker runner).
 */
const postCommitHooks = new WeakMap<object, Array<() => void | Promise<void>>>();

export function deferUntilCommit(tx: object, hook: () => void | Promise<void>): void {
	let arr = postCommitHooks.get(tx);
	if (!arr) {
		arr = [];
		postCommitHooks.set(tx, arr);
	}
	arr.push(hook);
}

/**
 * Run `fn` inside a transaction with `search_path` scoped to the tenant's schema.
 * `SET LOCAL` is transaction-bound, so the connection returned to the pool
 * cannot leak the modified search_path to a later request.
 *
 * After the transaction commits, drains any hooks registered via
 * `deferUntilCommit(tx, …)` so emitted domain events observe committed state.
 */
export async function withTenant<T>(
	db: DbClient,
	schemaName: string,
	fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
	if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
		throw new Error(`unsafe schema name: ${schemaName}`);
	}
	let txRef: object | undefined;
	const result = await db.transaction(async (tx) => {
		txRef = tx as unknown as object;
		await tx.execute(dsql.raw(`SET LOCAL search_path = "${schemaName}", public`));
		return await fn(tx);
	});
	if (txRef) {
		const hooks = postCommitHooks.get(txRef);
		if (hooks) {
			postCommitHooks.delete(txRef);
			for (const h of hooks) {
				try {
					await h();
				} catch (err) {
					console.error("[with-tenant] post-commit hook failed:", err);
				}
			}
		}
	}
	return result;
}
