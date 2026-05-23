import { Glob } from "bun";
import { sql as dsql, eq } from "drizzle-orm";
import { createDbClient } from "../client.ts";
import { tenantMigrations, tenants } from "../schema/control.ts";

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

export async function applyTenantMigrations(opts: {
	connectionString: string;
	folder?: string;
	onlySchema?: string;
}) {
	const folder = opts.folder ?? TENANT_MIGRATIONS_FOLDER;
	const migrations = await loadTenantMigrations(folder);
	const { db, sql } = createDbClient(opts.connectionString);

	try {
		const targets = opts.onlySchema
			? [{ schemaName: opts.onlySchema }]
			: await db.select({ schemaName: tenants.schemaName }).from(tenants);

		for (const { schemaName } of targets) {
			const applied = await db
				.select({ tag: tenantMigrations.migrationTag })
				.from(tenantMigrations)
				.where(eq(tenantMigrations.schemaName, schemaName));
			const appliedSet = new Set(applied.map((a) => a.tag));

			for (const m of migrations) {
				if (appliedSet.has(m.tag)) continue;
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
				console.log(`[tenant:${schemaName}] applied ${m.tag}`);
			}
		}
	} finally {
		await sql.end();
	}
}

if (import.meta.main) {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error("DATABASE_URL is not set");
		process.exit(1);
	}
	await applyTenantMigrations({ connectionString: url });
	console.log("[tenant] fan-out complete");
}
