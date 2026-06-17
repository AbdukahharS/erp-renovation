import { provisionTenant } from "@repo/db/provision";
import {
	tenantConfig,
	tenantMemberships,
	tenants,
	user as userTable,
} from "@repo/db/schema/control";
import { desc, sql as dsql, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db, dbUrl } from "../../db.ts";
import { auth } from "../auth/auth.ts";
import { requireSuperAdmin } from "./guards.ts";

/**
 * Phase 9 admin surface. Replaces the BOOTSTRAP_TOKEN-only `POST /tenants`
 * for production use; provisioning still lives there for the bootstrap path
 * (seeding the very first super-admin before this gate can be satisfied).
 */
export const adminRoutes = new Elysia()
	.use(requireSuperAdmin)

	.get("/admin/tenants", async () => {
		const rows = await db
			.select({
				id: tenants.id,
				name: tenants.name,
				slug: tenants.slug,
				schemaName: tenants.schemaName,
				status: tenants.status,
				createdAt: tenants.createdAt,
				deletedAt: tenants.deletedAt,
				currencyCode: tenantConfig.currencyCode,
			})
			.from(tenants)
			.leftJoin(tenantConfig, eq(tenantConfig.tenantId, tenants.id))
			.where(isNull(tenants.deletedAt))
			.orderBy(desc(tenants.createdAt));
		return rows;
	})

	.post(
		"/admin/tenants",
		async ({ body, set }) => {
			const existing = await db
				.select({ id: userTable.id })
				.from(userTable)
				.where(eq(userTable.email, body.ownerEmail))
				.limit(1);
			let ownerUserId: string;
			if (existing[0]) {
				ownerUserId = existing[0].id;
			} else {
				const signUp = await auth.api.signUpEmail({
					body: {
						email: body.ownerEmail,
						password: body.ownerPassword,
						name: body.ownerName,
					},
				});
				ownerUserId = signUp.user.id;
			}
			try {
				const result = await provisionTenant(db, {
					name: body.name,
					slug: body.slug,
					ownerUserId,
					connectionString: dbUrl,
				});
				await db
					.insert(tenantMemberships)
					.values({ userId: ownerUserId, tenantId: result.id, role: "OWNER" })
					.onConflictDoNothing();
				return { tenantId: result.id, schemaName: result.schemaName, ownerUserId };
			} catch (err) {
				set.status = 400;
				return { error: (err as Error).message };
			}
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1 }),
				slug: t.String({ minLength: 1, pattern: "^[a-z0-9-]+$" }),
				ownerEmail: t.String({ format: "email" }),
				ownerName: t.String({ minLength: 1 }),
				ownerPassword: t.String({ minLength: 12 }),
			}),
		},
	)

	.post(
		"/admin/tenants/:tenantId/suspend",
		async ({ params, set }) => {
			const [row] = await db
				.update(tenants)
				.set({ status: "SUSPENDED" })
				.where(eq(tenants.id, params.tenantId))
				.returning({ id: tenants.id, status: tenants.status });
			if (!row) {
				set.status = 404;
				return { error: "tenant not found" };
			}
			return row;
		},
		{ params: t.Object({ tenantId: t.String({ format: "uuid" }) }) },
	)

	.post(
		"/admin/tenants/:tenantId/resume",
		async ({ params, set }) => {
			const [existing] = await db
				.select({ deletedAt: tenants.deletedAt })
				.from(tenants)
				.where(eq(tenants.id, params.tenantId))
				.limit(1);
			if (!existing) {
				set.status = 404;
				return { error: "tenant not found" };
			}
			if (existing.deletedAt) {
				set.status = 409;
				return { error: "tenant is soft-deleted; cannot resume" };
			}
			const [row] = await db
				.update(tenants)
				.set({ status: "ACTIVE" })
				.where(eq(tenants.id, params.tenantId))
				.returning({ id: tenants.id, status: tenants.status });
			return row;
		},
		{ params: t.Object({ tenantId: t.String({ format: "uuid" }) }) },
	)

	// Export every table in the tenant schema as NDJSON. Streams row-by-row
	// (per-table paginated SELECTs) so memory is bounded by the page size,
	// not the largest table.
	.get(
		"/admin/tenants/:tenantId/export",
		async ({ params, set }) => {
			const [tenant] = await db
				.select({ schemaName: tenants.schemaName })
				.from(tenants)
				.where(eq(tenants.id, params.tenantId))
				.limit(1);
			if (!tenant) {
				set.status = 404;
				return { error: "tenant not found" };
			}
			// Defense-in-depth: schemaName originates in our control plane, but
			// validate the identifier shape before interpolating into raw SQL.
			if (!/^[a-z0-9_]+$/.test(tenant.schemaName)) {
				set.status = 500;
				return { error: "invalid tenant schema name" };
			}
			const schemaName = tenant.schemaName;
			const tables = await db.execute<{ table_name: string }>(
				dsql`SELECT table_name FROM information_schema.tables
					 WHERE table_schema = ${schemaName} AND table_type = 'BASE TABLE'
					 ORDER BY table_name`,
			);
			const PAGE = 1000;
			const encoder = new TextEncoder();
			const stream = new ReadableStream<Uint8Array>({
				async start(controller) {
					try {
						controller.enqueue(
							encoder.encode(
								`{"schemaName":${JSON.stringify(schemaName)},"exportedAt":${JSON.stringify(
									new Date().toISOString(),
								)}}\n`,
							),
						);
						for (const tbl of tables) {
							if (!/^[a-zA-Z0-9_]+$/.test(tbl.table_name)) continue;
							controller.enqueue(encoder.encode(`#table ${JSON.stringify(tbl.table_name)}\n`));
							let offset = 0;
							for (;;) {
								const rows = await db.execute<Record<string, unknown>>(
									dsql.raw(
										`SELECT * FROM "${schemaName}"."${tbl.table_name}" ORDER BY 1 LIMIT ${PAGE} OFFSET ${offset}`,
									),
								);
								for (const r of rows) {
									controller.enqueue(encoder.encode(`${JSON.stringify(r)}\n`));
								}
								if (rows.length < PAGE) break;
								offset += PAGE;
							}
						}
						controller.close();
					} catch (err) {
						controller.error(err);
					}
				},
			});
			return new Response(stream, {
				headers: {
					"content-type": "application/x-ndjson",
					"content-disposition": `attachment; filename="${schemaName}-export.ndjson"`,
				},
			});
		},
		{ params: t.Object({ tenantId: t.String({ format: "uuid" }) }) },
	)

	// Soft-delete: marks `tenants.deleted_at`. The schema and rows survive
	// until DELETE /admin/tenants/:id?purge=true runs, which physically drops
	// the schema. Forces an export-first workflow.
	.delete(
		"/admin/tenants/:tenantId",
		async ({ params, query, set }) => {
			const [tenant] = await db
				.select({ schemaName: tenants.schemaName, deletedAt: tenants.deletedAt })
				.from(tenants)
				.where(eq(tenants.id, params.tenantId))
				.limit(1);
			if (!tenant) {
				set.status = 404;
				return { error: "tenant not found" };
			}
			if (query.purge === "true") {
				if (!tenant.deletedAt) {
					set.status = 409;
					return { error: "tenant must be soft-deleted before purge" };
				}
				await db.transaction(async (tx) => {
					await tx.execute(dsql.raw(`DROP SCHEMA IF EXISTS "${tenant.schemaName}" CASCADE`));
					await tx.delete(tenants).where(eq(tenants.id, params.tenantId));
				});
				return { purged: true, schemaName: tenant.schemaName };
			}
			await db
				.update(tenants)
				.set({ status: "SUSPENDED", deletedAt: new Date() })
				.where(eq(tenants.id, params.tenantId));
			return { softDeleted: true, tenantId: params.tenantId };
		},
		{
			params: t.Object({ tenantId: t.String({ format: "uuid" }) }),
			query: t.Object({ purge: t.Optional(t.String()) }),
		},
	)

	.get(
		"/admin/tenants/:tenantId/config",
		async ({ params, set }) => {
			const [cfg] = await db
				.select()
				.from(tenantConfig)
				.where(eq(tenantConfig.tenantId, params.tenantId))
				.limit(1);
			if (!cfg) {
				set.status = 404;
				return { error: "config not found" };
			}
			return cfg;
		},
		{ params: t.Object({ tenantId: t.String({ format: "uuid" }) }) },
	)

	// Business-intelligence view for the superadmin: surfaces tenant pricing,
	// wage rates, materials, and financial aggregates without impersonation.
	// All cross-schema queries use explicit schema-qualified identifiers (no
	// search_path mutation) matching the pattern used by the export endpoint.
	.get(
		"/admin/tenants/:tenantId/overview",
		async ({ params, set }) => {
			const [row] = await db
				.select({
					id: tenants.id,
					name: tenants.name,
					slug: tenants.slug,
					schemaName: tenants.schemaName,
					status: tenants.status,
					createdAt: tenants.createdAt,
					currencyCode: tenantConfig.currencyCode,
					targetUnitCost: tenantConfig.targetUnitCost,
					ratingWeights: tenantConfig.ratingWeights,
					branding: tenantConfig.branding,
				})
				.from(tenants)
				.leftJoin(tenantConfig, eq(tenantConfig.tenantId, tenants.id))
				.where(eq(tenants.id, params.tenantId))
				.limit(1);

			if (!row) {
				set.status = 404;
				return { error: "tenant not found" };
			}

			if (!/^[a-z0-9_]+$/.test(row.schemaName)) {
				set.status = 500;
				return { error: "invalid tenant schema name" };
			}

			const s = row.schemaName;

			const [propRows, propCounts, templateRows, materialRows, finRows, closingRows] =
				await Promise.all([
					db.execute<{
						id: string;
						name: string;
						address: string;
						status: string;
						planned_unit_cost: string | null;
						area_sqm: string | null;
						created_at: string;
					}>(
						dsql.raw(
							`SELECT id, name, address, status, planned_unit_cost, area_sqm, created_at
							 FROM "${s}"."properties"
							 ORDER BY created_at DESC
							 LIMIT 50`,
						),
					),
					db.execute<{ status: string; count: string }>(
						dsql.raw(
							`SELECT status, COUNT(*)::text AS count FROM "${s}"."properties" GROUP BY status`,
						),
					),
					db.execute<{
						template_name: string;
						stage_order: number;
						stage_name: string;
						sub_stage_order: number;
						sub_stage_name: string;
						performer_type: string;
						specialization: string | null;
						wage_rate_per_sqm: string | null;
						standard_duration_days: number | null;
					}>(
						dsql.raw(
							`SELECT t.name AS template_name,
									s.order AS stage_order, s.name AS stage_name,
									ss.order AS sub_stage_order, ss.name AS sub_stage_name,
									ss.performer_type, ss.specialization,
									ss.wage_rate_per_sqm, ss.standard_duration_days
							 FROM "${s}"."templates" t
							 JOIN "${s}"."stages" s ON s.template_id = t.id
							 JOIN "${s}"."sub_stages" ss ON ss.stage_id = s.id
							 WHERE t.is_default = true
							 ORDER BY s.order, ss.order`,
						),
					),
					db.execute<{ id: string; name: string; unit: string; price: string }>(
						dsql.raw(
							`SELECT id, name, unit, price
							 FROM "${s}"."materials"
							 WHERE archived_at IS NULL
							 ORDER BY name
							 LIMIT 200`,
						),
					),
					db.execute<{ type: string; total: string }>(
						dsql.raw(
							`SELECT type, SUM(amount)::text AS total
							 FROM "${s}"."financial_transactions"
							 GROUP BY type`,
						),
					),
					db.execute<{ count: string; avg_net_profit: string | null }>(
						dsql.raw(
							`SELECT COUNT(*)::text AS count, AVG(net_profit)::text AS avg_net_profit
							 FROM "${s}"."unit_closings"
							 WHERE reopened_at IS NULL`,
						),
					),
				]);

			// Group template rows into nested stage structure
			type SubStageEntry = {
				order: number;
				name: string;
				performerType: string;
				specialization: string | null;
				wageRatePerSqm: string | null;
				standardDurationDays: number | null;
			};
			type StageEntry = { order: number; name: string; subStages: SubStageEntry[] };

			let templatePricing: { templateName: string; stages: StageEntry[] } | null = null;
			if (templateRows.length > 0) {
				const stageMap = new Map<string, StageEntry>();
				for (const r of templateRows) {
					const key = `${r.stage_order}:${r.stage_name}`;
					if (!stageMap.has(key)) {
						stageMap.set(key, { order: r.stage_order, name: r.stage_name, subStages: [] });
					}
					stageMap.get(key)!.subStages.push({
						order: r.sub_stage_order,
						name: r.sub_stage_name,
						performerType: r.performer_type,
						specialization: r.specialization,
						wageRatePerSqm: r.wage_rate_per_sqm,
						standardDurationDays: r.standard_duration_days,
					});
				}
				templatePricing = {
					templateName: templateRows[0]!.template_name,
					stages: [...stageMap.values()],
				};
			}

			const byStatus: Record<string, number> = {};
			for (const r of propCounts) byStatus[r.status] = Number(r.count);

			const byType: Record<string, string> = {};
			for (const r of finRows) byType[r.type] = r.total;

			const closing = closingRows[0];

			return {
				tenant: {
					id: row.id,
					name: row.name,
					slug: row.slug,
					schemaName: row.schemaName,
					status: row.status,
					createdAt: row.createdAt,
					currencyCode: row.currencyCode,
					targetUnitCost: row.targetUnitCost,
					ratingWeights: row.ratingWeights,
					branding: row.branding,
				},
				propertyStats: {
					total: Object.values(byStatus).reduce((a, b) => a + b, 0),
					byStatus,
					properties: propRows.map((p) => ({
						id: p.id,
						name: p.name,
						address: p.address,
						status: p.status,
						plannedUnitCost: p.planned_unit_cost,
						areaSqm: p.area_sqm,
						createdAt: p.created_at,
					})),
				},
				templatePricing,
				materialPricing: materialRows.map((m) => ({
					id: m.id,
					name: m.name,
					unit: m.unit,
					price: m.price,
				})),
				financialSummary: {
					byType,
					closedCount: Number(closing?.count ?? 0),
					avgNetProfit: closing?.avg_net_profit ?? null,
				},
			};
		},
		{ params: t.Object({ tenantId: t.String({ format: "uuid" }) }) },
	);
