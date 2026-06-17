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
 * Resolve a tenant's Postgres schema name from its id and validate the
 * identifier shape before it's interpolated into raw SQL. Sets the response
 * status (404/500) and returns null on failure. Shared by the cross-schema
 * read endpoints (overview, masters) that query without impersonation.
 */
async function resolveTenantSchema(
	tenantId: string,
	set: { status?: number | string },
): Promise<string | null> {
	const [row] = await db
		.select({ schemaName: tenants.schemaName })
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.limit(1);
	if (!row) {
		set.status = 404;
		return null;
	}
	if (!/^[a-z0-9_]+$/.test(row.schemaName)) {
		set.status = 500;
		return null;
	}
	return row.schemaName;
}

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
	)

	// Workforce roster for the superadmin: one row per master_profiles in the
	// tenant schema, cross-joined to the control-plane user for name/email and
	// enriched with balance + rating counts. Same no-impersonation, schema-
	// qualified raw-SQL pattern as /overview.
	.get(
		"/admin/tenants/:tenantId/masters",
		async ({ params, set }) => {
			const schemaName = await resolveTenantSchema(params.tenantId, set);
			if (!schemaName) return { error: "tenant not found or invalid schema" };
			const s = schemaName;

			const rows = await db.execute<{
				id: string;
				user_id: string;
				display_name: string | null;
				phone: string | null;
				specializations: string[] | null;
				user_name: string | null;
				user_email: string | null;
				balance: string | null;
				accepted_count: number | null;
				rejected_count: number | null;
			}>(
				dsql.raw(
					`SELECT mp.id, mp.user_id, mp.display_name, mp.phone, mp.specializations,
							u.name AS user_name, u.email AS user_email,
							mb.balance,
							mr.accepted_count, mr.rejected_count
					 FROM "${s}"."master_profiles" mp
					 LEFT JOIN public."user" u ON u.id = mp.user_id
					 LEFT JOIN "${s}"."master_balances" mb ON mb.master_user_id = mp.user_id
					 LEFT JOIN "${s}"."master_ratings" mr ON mr.master_user_id = mp.user_id
					 ORDER BY mp.display_name`,
				),
			);

			return {
				masters: rows.map((r) => ({
					id: r.id,
					userId: r.user_id,
					displayName: r.display_name ?? r.user_name ?? r.user_email ?? r.user_id,
					phone: r.phone,
					specializations: r.specializations ?? [],
					balance: r.balance ?? "0",
					acceptedCount: r.accepted_count ?? 0,
					rejectedCount: r.rejected_count ?? 0,
				})),
			};
		},
		{ params: t.Object({ tenantId: t.String({ format: "uuid" }) }) },
	)

	// Single master detail for the superadmin: profile + rating + balance, plus
	// basic work history (recent sub-stage assignments) and earn history (wage/
	// fine/payout ledger). Mirrors hr GET /owner/masters/:masterId and
	// finance buildMasterFinanceView, but read cross-schema without impersonation.
	.get(
		"/admin/tenants/:tenantId/masters/:masterId",
		async ({ params, set }) => {
			const schemaName = await resolveTenantSchema(params.tenantId, set);
			if (!schemaName) return { error: "tenant not found or invalid schema" };
			const s = schemaName;

			const profileRows = await db.execute<{
				id: string;
				user_id: string;
				display_name: string | null;
				phone: string | null;
				specializations: string[] | null;
				is_external_contractor: boolean;
				created_at: string;
				user_name: string | null;
				user_email: string | null;
			}>(
				dsql.raw(
					`SELECT mp.id, mp.user_id, mp.display_name, mp.phone, mp.specializations,
							mp.is_external_contractor, mp.created_at,
							u.name AS user_name, u.email AS user_email
					 FROM "${s}"."master_profiles" mp
					 LEFT JOIN public."user" u ON u.id = mp.user_id
					 WHERE mp.id = '${params.masterId}'
					 LIMIT 1`,
				),
			);
			const profile = profileRows[0];
			if (!profile) {
				set.status = 404;
				return { error: "master not found" };
			}
			const userId = profile.user_id;

			const [balanceRows, ratingRows, assignmentRows, txnRows] = await Promise.all([
				db.execute<{ balance: string }>(
					dsql.raw(
						`SELECT balance FROM "${s}"."master_balances"
						 WHERE master_user_id = '${userId}' LIMIT 1`,
					),
				),
				db.execute<{
					accepted_count: number;
					rejected_count: number;
					avg_duration_ratio: string | null;
				}>(
					dsql.raw(
						`SELECT accepted_count, rejected_count, avg_duration_ratio
						 FROM "${s}"."master_ratings"
						 WHERE master_user_id = '${userId}' LIMIT 1`,
					),
				),
				db.execute<{
					sub_stage_instance_id: string;
					property_id: string;
					property_name: string;
					sub_stage_name: string;
					status: string;
					claimed_at: string;
					released_at: string | null;
				}>(
					dsql.raw(
						`SELECT ssa.sub_stage_instance_id, si.property_id, p.name AS property_name,
								ssi.name AS sub_stage_name, ssi.status,
								ssa.claimed_at, ssa.released_at
						 FROM "${s}"."sub_stage_assignments" ssa
						 JOIN "${s}"."sub_stage_instances" ssi ON ssi.id = ssa.sub_stage_instance_id
						 JOIN "${s}"."stage_instances" si ON si.id = ssi.stage_instance_id
						 JOIN "${s}"."properties" p ON p.id = si.property_id
						 WHERE ssa.master_user_id = '${userId}'
						 ORDER BY ssa.claimed_at DESC
						 LIMIT 20`,
					),
				),
				db.execute<{
					id: string;
					type: string;
					amount: string;
					description: string | null;
					property_id: string | null;
					created_at: string;
				}>(
					dsql.raw(
						`SELECT id, type, amount, description, property_id, created_at
						 FROM "${s}"."financial_transactions"
						 WHERE master_user_id = '${userId}'
						   AND type IN ('WAGE_CREDIT', 'FINE', 'PAYOUT_SETTLEMENT')
						 ORDER BY created_at DESC
						 LIMIT 50`,
					),
				),
			]);

			let wagesCredited = 0;
			let finesDeducted = 0;
			let payoutsSettled = 0;
			for (const txn of txnRows) {
				const n = Number(txn.amount);
				if (txn.type === "WAGE_CREDIT") wagesCredited += n;
				else if (txn.type === "FINE") finesDeducted += -n;
				else if (txn.type === "PAYOUT_SETTLEMENT") payoutsSettled += -n;
			}

			return {
				profile: {
					id: profile.id,
					userId: profile.user_id,
					displayName:
						profile.display_name ?? profile.user_name ?? profile.user_email ?? profile.user_id,
					email: profile.user_email,
					phone: profile.phone,
					specializations: profile.specializations ?? [],
					isExternalContractor: profile.is_external_contractor,
					createdAt: profile.created_at,
				},
				rating: ratingRows[0]
					? {
							acceptedCount: ratingRows[0].accepted_count,
							rejectedCount: ratingRows[0].rejected_count,
							avgDurationRatio: ratingRows[0].avg_duration_ratio,
						}
					: null,
				balance: balanceRows[0]?.balance ?? "0",
				recentAssignments: assignmentRows.map((a) => ({
					subStageInstanceId: a.sub_stage_instance_id,
					propertyId: a.property_id,
					propertyName: a.property_name,
					subStageName: a.sub_stage_name,
					status: a.status,
					claimedAt: a.claimed_at,
					releasedAt: a.released_at,
				})),
				transactions: txnRows.map((txn) => ({
					id: txn.id,
					type: txn.type,
					amount: txn.amount,
					description: txn.description,
					propertyId: txn.property_id,
					createdAt: txn.created_at,
				})),
				wagesCredited: wagesCredited.toFixed(2),
				finesDeducted: finesDeducted.toFixed(2),
				payoutsSettled: payoutsSettled.toFixed(2),
			};
		},
		{
			params: t.Object({
				tenantId: t.String({ format: "uuid" }),
				masterId: t.String({ format: "uuid" }),
			}),
		},
	);
