import { tenantConfig } from "@repo/db/schema/control";
import { properties } from "@repo/db/schema/tenant";
import { and, sql as dsql, eq, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";

/**
 * Phase 9 per-tenant config. Reads use any role; writes are OWNER-only.
 * Changing `currencyCode` is rejected if non-archived properties exist —
 * mixing currencies inside a tenant breaks the dashboard's Plan-vs-Actual
 * (amounts are stored unit-less).
 */
const readRoutes = new Elysia({ prefix: "/tenant/config" })
	.use(tenancy)
	.get("", async ({ tenant, set }) => {
		if (!tenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const [cfg] = await db
			.select()
			.from(tenantConfig)
			.where(eq(tenantConfig.tenantId, tenant.id))
			.limit(1);
		if (!cfg) {
			set.status = 404;
			return { error: "config not found" };
		}
		return cfg;
	});

const writeRoutes = new Elysia({ prefix: "/tenant/config" })
	.use(tenancy)
	.use(requireRole("OWNER"))
	.patch(
		"",
		async ({ tenant, body, runInTenant, set }) => {
			if (!tenant || !runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const updates: Record<string, unknown> = { updatedAt: new Date() };
			if (body.currencyCode !== undefined) {
				// Guard: only allow currency change when no live properties exist.
				const rows = await runInTenant(async (tx) =>
					tx.execute<{ n: number }>(
						dsql`SELECT count(*)::int AS n FROM ${properties} WHERE ${ne(properties.status, "ARCHIVED")}`,
					),
				);
				const n = rows[0]?.n ?? 0;
				if (n > 0) {
					set.status = 409;
					return {
						error:
							"cannot change currency while non-archived properties exist; archive all properties first",
					};
				}
				updates.currencyCode = body.currencyCode;
			}
			if (body.targetUnitCost !== undefined) updates.targetUnitCost = body.targetUnitCost;
			if (body.ratingWeights !== undefined) updates.ratingWeights = body.ratingWeights;
			if (body.branding !== undefined) updates.branding = body.branding;
			if (body.photoRetentionDays !== undefined)
				updates.photoRetentionDays = body.photoRetentionDays;
			if (body.notificationRetentionDays !== undefined)
				updates.notificationRetentionDays = body.notificationRetentionDays;
			const [row] = await db
				.update(tenantConfig)
				.set(updates)
				.where(eq(tenantConfig.tenantId, tenant.id))
				.returning();
			return row;
		},
		{
			body: t.Object({
				currencyCode: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
				targetUnitCost: t.Optional(t.Union([t.String(), t.Null()])),
				ratingWeights: t.Optional(
					t.Object({ speed: t.Number({ minimum: 0 }), defect: t.Number({ minimum: 0 }) }),
				),
				branding: t.Optional(
					t.Object({
						displayName: t.Optional(t.String()),
						primaryColor: t.Optional(t.String()),
						logoKey: t.Optional(t.String()),
					}),
				),
				photoRetentionDays: t.Optional(t.Number({ minimum: 30, maximum: 3650 })),
				notificationRetentionDays: t.Optional(t.Number({ minimum: 7, maximum: 730 })),
			}),
		},
	);

export const tenantConfigRoutes = new Elysia().use(readRoutes).use(writeRoutes);

// Silence unused; `and` kept for future composite guards (e.g. role+region).
void and;
