import { sql as dsql } from "drizzle-orm";
import type { DbClient } from "./client.ts";
import { applyTenantMigrations } from "./migrations/fanout.ts";
import type { Role } from "./schema/control.ts";
import { tenantMemberships, tenants } from "./schema/control.ts";

export interface ProvisionTenantInput {
	name: string;
	slug: string;
	ownerUserId: string;
	connectionString: string;
}

export interface ProvisionTenantResult {
	id: string;
	schemaName: string;
	name: string;
	slug: string;
}

export async function provisionTenant(
	db: DbClient,
	input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
	const id = crypto.randomUUID();
	const schemaName = `tenant_${id.replace(/-/g, "")}`;
	const ownerRole: Role = "OWNER";

	await db.transaction(async (tx) => {
		await tx.insert(tenants).values({ id, name: input.name, slug: input.slug, schemaName });
		await tx.execute(dsql.raw(`CREATE SCHEMA "${schemaName}"`));
		await tx
			.insert(tenantMemberships)
			.values({ userId: input.ownerUserId, tenantId: id, role: ownerRole });
	});

	// Apply tenant migrations against the new schema.
	// Done after the outer tx because the fan-out opens its own connection
	// and inner txns for each migration; the schema must already exist + be committed.
	// applyTenantMigrations runs the tenant migration set AND seeds the default
	// template if the schema is fresh — see migrations/fanout.ts seed-or-skip.
	await applyTenantMigrations({ connectionString: input.connectionString, onlySchema: schemaName });

	return { id, schemaName, name: input.name, slug: input.slug };
}
