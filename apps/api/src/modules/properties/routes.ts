import { instantiateTemplate } from "@repo/db/instantiate-template";
import { tenantMemberships, tenants } from "@repo/db/schema/control";
import {
	checklistItemInstances,
	mediaRequirementInstances,
	notificationIntents,
	properties,
	propertyAssets,
	stageInstances,
	subStageInstances,
	templates,
} from "@repo/db/schema/tenant";
import {
	DEFAULT_JOB_OPTS,
	getNotificationDispatchQueue,
	type NotificationDispatchJobData,
} from "@repo/queue";
import {
	AttachFloorPlanInput,
	CreatePropertyInput,
	PresignAssetUploadInput,
	UpdatePropertyInput,
} from "@repo/validators";
import { and, asc, sql as dsql, eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import {
	assertAssetExists,
	presignPropertyAssetUpload,
	r2Client,
	tenantOwnsKey,
} from "../../lib/r2.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";

/**
 * Phase 3 properties module. Owner-only, tenant-scoped via the tenancy plugin.
 *
 * Creating a property snapshots the tenant's default template into per-property
 * instance tables (see instantiateTemplate). At creation time the first sub-
 * stage (1.1, INSPECTOR) is AVAILABLE; all master sub-stages stay LOCKED until
 * Phase 4's acceptance loop transitions 1.1 → ACCEPTED.
 */
export const propertiesRoutes = new Elysia({ prefix: "" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	.get("/properties", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const rows = (await tx
				.select({
					id: properties.id,
					name: properties.name,
					address: properties.address,
					layoutType: properties.layoutType,
					areaSqm: properties.areaSqm,
					plannedUnitCost: properties.plannedUnitCost,
					status: properties.status,
					floorPlanAssetId: properties.floorPlanAssetId,
					materialsOnSite: properties.materialsOnSite,
					deadlineAt: properties.deadlineAt,
					createdAt: properties.createdAt,
					updatedAt: properties.updatedAt,
					totalMasterSubStages: dsql<number>`count(${subStageInstances.id}) filter (where ${subStageInstances.performerType} = 'MASTER')::int`,
					acceptedMasterSubStages: dsql<number>`count(${subStageInstances.id}) filter (where ${subStageInstances.performerType} = 'MASTER' and ${subStageInstances.status} = 'ACCEPTED')::int`,
				})
				.from(properties)
				.leftJoin(stageInstances, eq(stageInstances.propertyId, properties.id))
				.leftJoin(subStageInstances, eq(subStageInstances.stageInstanceId, stageInstances.id))
				.groupBy(properties.id)
				.orderBy(asc(properties.createdAt))) as unknown[];
			return rows;
		});
	})

	.get("/properties/:propertyId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [prop] = await tx
				.select()
				.from(properties)
				.where(eq(properties.id, params.propertyId))
				.limit(1);
			if (!prop) {
				set.status = 404;
				return { error: "property not found" };
			}

			const stageRows = await tx
				.select()
				.from(stageInstances)
				.where(eq(stageInstances.propertyId, prop.id))
				.orderBy(asc(stageInstances.order));
			const stageIds = stageRows.map((s) => s.id);
			const subStageRows = stageIds.length
				? await tx
						.select()
						.from(subStageInstances)
						.where(inArray(subStageInstances.stageInstanceId, stageIds))
						.orderBy(asc(subStageInstances.order))
				: [];
			const subStageIds = subStageRows.map((s) => s.id);
			const [checklistRows, mediaRows] = await Promise.all([
				subStageIds.length
					? tx
							.select()
							.from(checklistItemInstances)
							.where(inArray(checklistItemInstances.subStageInstanceId, subStageIds))
							.orderBy(asc(checklistItemInstances.order))
					: Promise.resolve([] as (typeof checklistItemInstances.$inferSelect)[]),
				subStageIds.length
					? tx
							.select()
							.from(mediaRequirementInstances)
							.where(inArray(mediaRequirementInstances.subStageInstanceId, subStageIds))
					: Promise.resolve([] as (typeof mediaRequirementInstances.$inferSelect)[]),
			]);

			const checklistBySub = new Map<string, typeof checklistRows>();
			for (const c of checklistRows) {
				const arr = checklistBySub.get(c.subStageInstanceId) ?? [];
				arr.push(c);
				checklistBySub.set(c.subStageInstanceId, arr);
			}
			const mediaBySub = new Map<string, typeof mediaRows>();
			for (const m of mediaRows) {
				const arr = mediaBySub.get(m.subStageInstanceId) ?? [];
				arr.push(m);
				mediaBySub.set(m.subStageInstanceId, arr);
			}
			const subsByStage = new Map<string, typeof subStageRows>();
			for (const s of subStageRows) {
				const arr = subsByStage.get(s.stageInstanceId) ?? [];
				arr.push(s);
				subsByStage.set(s.stageInstanceId, arr);
			}

			let floorPlanAsset = null;
			if (prop.floorPlanAssetId) {
				const [a] = await tx
					.select()
					.from(propertyAssets)
					.where(eq(propertyAssets.id, prop.floorPlanAssetId))
					.limit(1);
				floorPlanAsset = a ?? null;
			}

			return {
				...prop,
				stages: stageRows.map((s) => ({
					...s,
					subStages: (subsByStage.get(s.id) ?? []).map((ss) => ({
						...ss,
						checklistItems: checklistBySub.get(ss.id) ?? [],
						mediaRequirements: mediaBySub.get(ss.id) ?? [],
					})),
				})),
				floorPlanAsset,
			};
		});
	})

	.post(
		"/properties",
		async ({ body, tenant, runInTenant, set }) => {
			if (!runInTenant || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const created = await runInTenant(async (tx) => {
				const [picked] = await tx
					.select({ id: templates.id })
					.from(templates)
					.where(eq(templates.id, body.templateId))
					.limit(1);
				if (!picked) return { kind: "error" as const, message: "template not found in tenant" };
				const [prop] = await tx
					.insert(properties)
					.values({
						name: body.name,
						address: body.address,
						layoutType: body.layoutType,
						areaSqm: body.areaSqm,
						plannedUnitCost: body.plannedUnitCost,
						templateSnapshotId: picked.id,
						deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : null,
					})
					.returning();
				if (!prop) throw new Error("failed to create property");
				await instantiateTemplate(
					tx,
					prop.id,
					picked.id,
					body.areaSqm,
					body.editedSnapshot ?? null,
				);

				// Phase 8: instantiation makes Sub-stage 1.1 (INSPECTOR-performed)
				// AVAILABLE. The acceptance loop's notify path only fires on
				// SUBMITTED/REJECTED/etc, and stage-propagate's STAGE_AVAILABLE
				// emitter filters to MASTER — so without this block the inspector
				// hears nothing about a fresh property. Target every INSPECTOR
				// membership of the tenant (control-plane lookup mirrors
				// acceptance/notify.ts STAGE_SUBMITTED).
				const availableInspectorSubs = await tx
					.select({ id: subStageInstances.id })
					.from(subStageInstances)
					.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
					.where(
						and(
							eq(stageInstances.propertyId, prop.id),
							eq(subStageInstances.performerType, "INSPECTOR"),
							eq(subStageInstances.status, "AVAILABLE"),
						),
					);

				const intentIds: string[] = [];
				if (availableInspectorSubs.length > 0) {
					const [t] = await db
						.select({ id: tenants.id })
						.from(tenants)
						.where(eq(tenants.schemaName, tenant.schemaName))
						.limit(1);
					const inspectors = t
						? await db
								.select({ userId: tenantMemberships.userId })
								.from(tenantMemberships)
								.where(
									and(
										eq(tenantMemberships.tenantId, t.id),
										eq(tenantMemberships.role, "INSPECTOR"),
									),
								)
						: [];
					for (const ssi of availableInspectorSubs) {
						for (const insp of inspectors) {
							const inserted = await tx
								.insert(notificationIntents)
								.values({
									type: "STAGE_AVAILABLE",
									targetUserId: insp.userId,
									subStageInstanceId: ssi.id,
									propertyId: prop.id,
									payload: { performerType: "INSPECTOR" },
								})
								.onConflictDoNothing({
									target: [
										notificationIntents.targetUserId,
										notificationIntents.subStageInstanceId,
										notificationIntents.type,
									],
								})
								.returning({ id: notificationIntents.id });
							for (const row of inserted) intentIds.push(row.id);
						}
					}
				}

				return { kind: "ok" as const, id: prop.id, intentIds };
			});

			if (created.kind === "error") {
				set.status = 409;
				return { error: created.message };
			}

			// Enqueue dispatch AFTER the tenant tx commits so the worker can read
			// the intent rows.
			if (process.env.REDIS_URL && created.intentIds.length > 0) {
				const q = getNotificationDispatchQueue();
				await Promise.all(
					created.intentIds.map((intentId) =>
						q.add(
							"notification-dispatch",
							{
								tenantSchema: tenant.schemaName,
								notificationIntentId: intentId,
							} satisfies NotificationDispatchJobData,
							{ ...DEFAULT_JOB_OPTS, jobId: `dispatch-${intentId}` },
						),
					),
				);
			}

			return { id: created.id };
		},
		{ body: zodBody(CreatePropertyInput) },
	)

	.patch(
		"/properties/:propertyId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const updates: Record<string, unknown> = { updatedAt: new Date() };
				if (body.name !== undefined) updates.name = body.name;
				if (body.address !== undefined) updates.address = body.address;
				if (body.layoutType !== undefined) updates.layoutType = body.layoutType;
				if (body.plannedUnitCost !== undefined) updates.plannedUnitCost = body.plannedUnitCost;
				if (body.deadlineAt !== undefined)
					updates.deadlineAt = body.deadlineAt ? new Date(body.deadlineAt) : null;
				const [row] = await tx
					.update(properties)
					.set(updates)
					.where(eq(properties.id, params.propertyId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "property not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdatePropertyInput) },
	)

	.delete("/properties/:propertyId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [prop] = await tx
				.select({ status: properties.status })
				.from(properties)
				.where(eq(properties.id, params.propertyId))
				.limit(1);
			if (!prop) {
				set.status = 404;
				return { error: "property not found" };
			}
			if (prop.status !== "PENDING") {
				set.status = 409;
				return { error: "only PENDING properties can be deleted" };
			}
			await tx.delete(properties).where(eq(properties.id, params.propertyId));
			return { ok: true };
		});
	})

	.post(
		"/properties/:propertyId/floor-plan/presign",
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
					.where(eq(properties.id, params.propertyId))
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
						kind: "FLOOR_PLAN",
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
						kind: "FLOOR_PLAN",
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
		"/properties/:propertyId/floor-plan/attach",
		async ({ params, body, tenant, runInTenant, set }) => {
			if (!runInTenant || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [asset] = await tx
					.select()
					.from(propertyAssets)
					.where(
						and(
							eq(propertyAssets.id, body.assetId),
							eq(propertyAssets.propertyId, params.propertyId),
							eq(propertyAssets.kind, "FLOOR_PLAN"),
						),
					)
					.limit(1);
				if (!asset) {
					set.status = 404;
					return { error: "asset not found" };
				}
				if (!tenantOwnsKey(tenant.schemaName, asset.r2Key)) {
					set.status = 403;
					return { error: "asset key does not belong to this tenant" };
				}
				const exists = await assertAssetExists(asset.r2Key);
				if (!exists) {
					set.status = 409;
					return { error: "object has not been uploaded to storage" };
				}
				// Stamp uploadedAt on the asset row here — the presign route only
				// recorded "presigned at"; the actual upload completes between presign
				// and this call. Without the update the column would mislead Phase 7
				// reports that read it as a true upload timestamp.
				const [updatedAsset] = await tx
					.update(propertyAssets)
					.set({ uploadedAt: new Date() })
					.where(eq(propertyAssets.id, asset.id))
					.returning();
				const [prop] = await tx
					.update(properties)
					.set({ floorPlanAssetId: asset.id, updatedAt: new Date() })
					.where(eq(properties.id, params.propertyId))
					.returning();
				return { property: prop, asset: updatedAsset ?? asset };
			});
		},
		{ body: zodBody(AttachFloorPlanInput) },
	);
