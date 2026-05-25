import { tenantMemberships } from "@repo/db/schema/control";
import { masterBalances, properties, propertyAssets, rejections } from "@repo/db/schema/tenant";
import {
	ApplyFineInput,
	CloseUnitInput,
	ClosingPermissionInput,
	CreatePropertyCostInput,
	MarkPayoutInput,
	PresignAssetUploadInput,
} from "@repo/validators";
// Imports above are used for runtime body validation via zodBody.
import { and, sql as dsql, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { presignPropertyAssetUpload, r2Client } from "../../lib/r2.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";
import { finalizeClosing } from "./close.ts";
import {
	applyFine,
	buildMasterFinanceView,
	buildPropertyFinanceSummary,
	findMasterProfileByUserId,
	getRejectionContext,
	listPropertyCosts,
	listPropertyFinanceSummaries,
	markPayoutSettled,
	recordPropertyCost,
	reopenClosing,
	reversePropertyCost,
} from "./service.ts";

const ownerRoutes = new Elysia({ prefix: "/owner" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	.get("/properties/:id/finance", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const summary = await buildPropertyFinanceSummary(tx, params.id);
			if (!summary) {
				set.status = 404;
				return { error: "property not found" };
			}
			const costs = await listPropertyCosts(tx, params.id);
			return { summary, costs };
		});
	})

	.get("/finance", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant((tx) => listPropertyFinanceSummaries(tx));
	})

	.post(
		"/properties/:id/costs",
		async ({ params, body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [prop] = await tx
					.select({ id: properties.id, status: properties.status })
					.from(properties)
					.where(eq(properties.id, params.id))
					.limit(1);
				if (!prop) {
					set.status = 404;
					return { error: "property not found" };
				}
				if (prop.status === "ARCHIVED") {
					set.status = 409;
					return { error: "property is archived" };
				}
				const r = await recordPropertyCost(tx, {
					propertyId: prop.id,
					input: body,
					createdBy: user.id,
				});
				return r;
			});
		},
		{ body: zodBody(CreatePropertyCostInput) },
	)

	.delete("/properties/:id/costs/:costId", async ({ params, user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [prop] = await tx
				.select({ status: properties.status })
				.from(properties)
				.where(eq(properties.id, params.id))
				.limit(1);
			if (!prop) {
				set.status = 404;
				return { error: "property not found" };
			}
			if (prop.status === "ARCHIVED") {
				set.status = 409;
				return { error: "cannot reverse cost on archived property" };
			}
			const ok = await reversePropertyCost(tx, {
				propertyId: params.id,
				costId: params.costId,
				reversedBy: user.id,
			});
			if (!ok) {
				set.status = 404;
				return { error: "cost not found or already reversed" };
			}
			return { ok: true };
		});
	})

	.get("/masters/:id/finance", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant((tx) => buildMasterFinanceView(tx, params.id));
	})

	.post(
		"/masters/:id/payouts",
		async ({ params, body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [bal] = await tx
					.select()
					.from(masterBalances)
					.where(eq(masterBalances.masterUserId, params.id))
					.limit(1);
				if (!bal) {
					set.status = 404;
					return { error: "master balance not found" };
				}
				if (Number(bal.balance) < Number(body.amount)) {
					set.status = 409;
					return { error: "payout exceeds current balance" };
				}
				const r = await markPayoutSettled(tx, {
					masterUserId: params.id,
					input: body,
					settledBy: user.id,
				});
				return r;
			});
		},
		{ body: zodBody(MarkPayoutInput) },
	)

	// Presign a PORTFOLIO_PHOTO upload for the closing flow. Mirrors the
	// floor-plan presign in apps/api/src/modules/properties/routes.ts but
	// gated to Owner since closing is an Owner action (Inspector with
	// closingPermission also needs this in real life; reachable via the same
	// path due to shared tenancy, but route role-guard is OWNER here. If we
	// surface inspector closing in UI later, add a parallel inspector route).
	.post(
		"/properties/:id/portfolio/presign",
		async ({ params, body, tenant, runInTenant, set }) => {
			if (!runInTenant || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			if (!r2Client) {
				set.status = 503;
				return { error: "object storage not configured" };
			}
			return await runInTenant(async (tx) => {
				const [prop] = await tx
					.select({ id: properties.id })
					.from(properties)
					.where(eq(properties.id, params.id))
					.limit(1);
				if (!prop) {
					set.status = 404;
					return { error: "property not found" };
				}
				let presigned: ReturnType<typeof presignPropertyAssetUpload>;
				try {
					presigned = presignPropertyAssetUpload({
						tenantSchema: tenant.schemaName,
						propertyId: prop.id,
						kind: "PORTFOLIO_PHOTO",
						contentType: body.contentType,
					});
				} catch (err) {
					set.status = 400;
					return { error: (err as Error).message };
				}
				const [asset] = await tx
					.insert(propertyAssets)
					.values({
						propertyId: prop.id,
						kind: "PORTFOLIO_PHOTO",
						r2Key: presigned.key,
						contentType: body.contentType,
					})
					.returning({ id: propertyAssets.id });
				if (!asset) throw new Error("failed to create asset record");
				return {
					assetId: asset.id,
					uploadUrl: presigned.url,
					key: presigned.key,
					expiresInSeconds: presigned.expiresInSeconds,
				};
			});
		},
		{ body: zodBody(PresignAssetUploadInput) },
	)

	.post(
		"/properties/:id/close",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !tenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			// Re-run the Zod schema to apply array .min(1) — TypeBox doesn't carry
			// that constraint through jsonToTypeBox so we enforce it here.
			const parsed = CloseUnitInput.safeParse(body);
			if (!parsed.success) {
				set.status = 422;
				return { error: parsed.error.issues[0]?.message ?? "invalid body" };
			}
			return await finalizeClosing({
				propertyId: params.id,
				input: parsed.data,
				closedBy: user.id,
				tenantSchema: tenant.schemaName,
				runInTenant,
				set,
			});
		},
		{ body: zodBody(CloseUnitInput) },
	)

	.post("/properties/:id/reopen", async ({ params, user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [prop] = await tx
				.select({ status: properties.status })
				.from(properties)
				.where(eq(properties.id, params.id))
				.limit(1);
			if (!prop) {
				set.status = 404;
				return { error: "property not found" };
			}
			if (prop.status !== "ARCHIVED") {
				set.status = 409;
				return { error: "property is not archived" };
			}
			const ok = await reopenClosing(tx, { propertyId: params.id, reopenedBy: user.id });
			if (!ok) {
				set.status = 409;
				return { error: "closing not found or already reopened" };
			}
			return { ok: true };
		});
	})

	.post(
		"/memberships/:userId/closing-permission",
		async ({ params, body, tenant, set }) => {
			if (!tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const [row] = await db
				.update(tenantMemberships)
				.set({ closingPermission: body.closingPermission })
				.where(
					and(
						eq(tenantMemberships.userId, params.userId),
						eq(tenantMemberships.tenantId, tenant.id),
					),
				)
				.returning();
			if (!row) {
				set.status = 404;
				return { error: "membership not found" };
			}
			return { ok: true, closingPermission: row.closingPermission };
		},
		{ body: zodBody(ClosingPermissionInput) },
	);

const inspectorRoutes = new Elysia({ prefix: "/inspector" })
	.use(tenancy)
	.use(requireRole("INSPECTOR"))

	.post(
		"/rejections/:rejectionId/fine",
		async ({ params, body, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ctx = await getRejectionContext(tx, params.rejectionId);
				if (!ctx) {
					set.status = 404;
					return { error: "rejection not found" };
				}
				// Sanity: rejection must exist on this tenant.
				const [r] = await tx
					.select({ id: rejections.id })
					.from(rejections)
					.where(eq(rejections.id, params.rejectionId))
					.limit(1);
				if (!r) {
					set.status = 404;
					return { error: "rejection not found" };
				}
				const result = await applyFine(tx, {
					masterUserId: ctx.masterUserId,
					propertyId: ctx.propertyId,
					rejectionId: params.rejectionId,
					input: body,
					appliedBy: user.id,
				});
				return result;
			});
		},
		{ body: zodBody(ApplyFineInput) },
	)

	// Helper for the inspector UI: look up the most recent rejection on a
	// sub-stage so the "Apply fine" panel knows what rejection_id to attach.
	// Returns null when none exists (e.g. stage was rejected, fined, then a new
	// rejection occurred → still returns the latest; the unique index prevents
	// duplicate fines on the same rejection).
	.get("/stages/:id/latest-rejection", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const rows = (await tx.execute(
				dsql`SELECT r.id, r.comment, r.rejected_at,
					exists(SELECT 1 FROM fines f WHERE f.rejection_id = r.id) AS fined
					FROM rejections r
					JOIN acceptance_requests ar ON ar.id = r.acceptance_request_id
					WHERE ar.sub_stage_instance_id = ${params.id}
					ORDER BY r.rejected_at DESC LIMIT 1`,
			)) as Array<{ id: string; comment: string; rejected_at: Date; fined: boolean }>;
			const r = rows[0];
			return r ? { id: r.id, comment: r.comment, rejectedAt: r.rejected_at, fined: r.fined } : null;
		});
	})

	.post(
		"/properties/:id/close",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !tenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			// Inspector close requires explicit closingPermission on membership.
			const [membership] = await db
				.select({ closingPermission: tenantMemberships.closingPermission })
				.from(tenantMemberships)
				.where(
					and(eq(tenantMemberships.userId, user.id), eq(tenantMemberships.tenantId, tenant.id)),
				)
				.limit(1);
			if (!membership?.closingPermission) {
				set.status = 403;
				return { error: "closing permission required" };
			}
			// Re-run the Zod schema to apply array .min(1) — TypeBox doesn't carry
			// that constraint through jsonToTypeBox so we enforce it here.
			const parsed = CloseUnitInput.safeParse(body);
			if (!parsed.success) {
				set.status = 422;
				return { error: parsed.error.issues[0]?.message ?? "invalid body" };
			}
			return await finalizeClosing({
				propertyId: params.id,
				input: parsed.data,
				closedBy: user.id,
				tenantSchema: tenant.schemaName,
				runInTenant,
				set,
			});
		},
		{ body: zodBody(CloseUnitInput) },
	);

const masterRoutes = new Elysia({ prefix: "/master" })
	.use(tenancy)
	.use(requireRole("MASTER"))

	.get("/finance", async ({ user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const profile = await findMasterProfileByUserId(tx, user.id);
			if (!profile) {
				set.status = 404;
				return { error: "master profile not found" };
			}
			return await buildMasterFinanceView(tx, profile.userId);
		});
	});

export const financeRoutes = new Elysia().use(ownerRoutes).use(inspectorRoutes).use(masterRoutes);
