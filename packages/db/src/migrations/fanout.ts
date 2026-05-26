import { parseArgs } from "node:util";
import { Glob } from "bun";
import { sql as dsql, eq } from "drizzle-orm";
import { createDbClient } from "../client.ts";
import { tenantMigrations, tenants } from "../schema/control.ts";
import { seedDefaultTemplate } from "../seed/default-template.ts";

export interface TenantMigration {
	tag: string;
	statements: string[];
}

export async function loadTenantMigrations(folder: string): Promise<TenantMigration[]> {
	const files = [...new Glob("*.sql").scanSync({ cwd: folder })].sort();
	return await Promise.all(
		files.map(async (f) => {
			const content = await Bun.file(`${folder}/${f}`).text();
			const statements = content
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean);
			return { tag: f.replace(/\.sql$/, ""), statements };
		}),
	);
}

const TENANT_MIGRATIONS_FOLDER = `${import.meta.dir}/../../drizzle/tenant`;

export interface FanoutOptions {
	connectionString: string;
	folder?: string;
	onlySchema?: string;
	onlyTenantSlug?: string;
	dryRun?: boolean;
}

export interface FanoutResult {
	applied: Array<{ schemaName: string; tag: string }>;
	pending: Array<{ schemaName: string; tag: string }>;
	failed: Array<{ schemaName: string; tag: string; error: string }>;
}

/**
 * Phase 9: per-schema failure isolation. A bad migration on schema X no longer
 * halts the fan-out; we collect the error and continue to schema Y. The
 * caller (CLI) exits non-zero with the summary so CI / operators see it.
 *
 * `--dry-run` reports the pending (schema, tag) pairs without writing.
 * `--only-tenant <slug>` targets one tenant (handy for re-running after a
 * fix).
 */
export async function applyTenantMigrations(opts: FanoutOptions): Promise<FanoutResult> {
	const folder = opts.folder ?? TENANT_MIGRATIONS_FOLDER;
	const migrations = await loadTenantMigrations(folder);
	const { db, sql } = createDbClient(opts.connectionString);
	const result: FanoutResult = { applied: [], pending: [], failed: [] };

	try {
		let targets: Array<{ schemaName: string }>;
		if (opts.onlySchema) {
			targets = [{ schemaName: opts.onlySchema }];
		} else if (opts.onlyTenantSlug) {
			const rows = await db
				.select({ schemaName: tenants.schemaName })
				.from(tenants)
				.where(eq(tenants.slug, opts.onlyTenantSlug));
			targets = rows;
		} else {
			targets = await db.select({ schemaName: tenants.schemaName }).from(tenants);
		}

		for (const { schemaName } of targets) {
			const applied = await db
				.select({ tag: tenantMigrations.migrationTag })
				.from(tenantMigrations)
				.where(eq(tenantMigrations.schemaName, schemaName));
			const appliedSet = new Set(applied.map((a) => a.tag));

			for (const m of migrations) {
				if (appliedSet.has(m.tag)) continue;
				if (opts.dryRun) {
					result.pending.push({ schemaName, tag: m.tag });
					console.log(`[dry-run] would apply ${m.tag} to ${schemaName}`);
					continue;
				}
				try {
					await db.transaction(async (tx) => {
						await tx.execute(dsql.raw(`SET LOCAL search_path = "${schemaName}"`));
						for (const stmt of m.statements) {
							await tx.execute(dsql.raw(stmt));
						}
						// Bookkeeping row goes back into public — qualify explicitly because
						// search_path is currently scoped to the tenant schema.
						await tx.execute(
							dsql`INSERT INTO public.tenant_migrations (schema_name, migration_tag) VALUES (${schemaName}, ${m.tag})`,
						);
					});
					result.applied.push({ schemaName, tag: m.tag });
					console.log(`[tenant:${schemaName}] applied ${m.tag}`);
				} catch (err) {
					const message = (err as Error).message;
					result.failed.push({ schemaName, tag: m.tag, error: message });
					console.error(`[tenant:${schemaName}] FAILED ${m.tag}: ${message}`);
					// Bail out of this schema; later schemas continue.
					break;
				}
			}

			// Seed-or-skip: if the templates table exists but has no rows, seed the
			// default. Only runs when we actually applied something (or always for
			// dry-run skips, since dry-run shouldn't write).
			if (opts.dryRun) continue;
			const exists = await db.execute<{ exists: boolean }>(
				dsql`SELECT EXISTS (
					SELECT 1 FROM information_schema.tables
					WHERE table_schema = ${schemaName} AND table_name = 'templates'
				) AS exists`,
			);
			if (exists[0]?.exists) {
				const count = await db.execute<{ n: number }>(
					dsql.raw(`SELECT count(*)::int AS n FROM "${schemaName}".templates`),
				);
				if ((count[0]?.n ?? 0) === 0) {
					await seedDefaultTemplate(db, schemaName);
					console.log(`[tenant:${schemaName}] seeded default template`);
				}
			}
		}
	} finally {
		await sql.end();
	}
	return result;
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			"dry-run": { type: "boolean" },
			"only-tenant": { type: "string" },
			"only-schema": { type: "string" },
		},
	});
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error("DATABASE_URL is not set");
		process.exit(1);
	}
	const result = await applyTenantMigrations({
		connectionString: url,
		onlySchema: values["only-schema"],
		onlyTenantSlug: values["only-tenant"],
		dryRun: values["dry-run"],
	});
	const summary = {
		applied: result.applied.length,
		pending: result.pending.length,
		failed: result.failed.length,
	};
	console.log(`[tenant] fan-out complete: ${JSON.stringify(summary)}`);
	if (result.failed.length > 0) {
		for (const f of result.failed) {
			console.error(` - ${f.schemaName} ${f.tag}: ${f.error}`);
		}
		process.exit(1);
	}
}
