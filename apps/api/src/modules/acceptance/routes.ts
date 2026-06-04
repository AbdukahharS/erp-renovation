import { recomputeMasterRating } from "@repo/acceptance/rating";
import {
	acceptanceRequests,
	checklistItemInstances,
	checklistResults,
	masterProfiles,
	mediaRequirementInstances,
	properties,
	propertyAssets,
	rejections,
	stageInstanceDependencies,
	stageInstances,
	stageMediaAssets,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { deferUntilCommit } from "@repo/db/with-tenant";
import {
	AcceptInput,
	AttachInspectorMediaInput,
	AttachStageMediaInput,
	ManualOverrideInput,
	PresignInspectorMediaInput,
	PresignStageMediaInput,
	RejectInput,
	SubmitForAcceptanceInput,
	SubmitSelfInspectorInput,
} from "@repo/validators";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import {
	assertAssetExists,
	presignPropertyAssetUpload,
	r2Bucket,
	r2Client,
	tenantOwnsKey,
} from "../../lib/r2.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";
import { emitAcceptanceNotificationIntents, enqueueDispatchForIntents } from "./notify.ts";
import {
	activeAcceptanceRequest,
	activeAssignment,
	canTransition,
	isUnlocked,
	lockSubStage,
	maybeAdvancePropertyOnTake,
	missingRequiredMedia,
	propertyIdForSubStage,
	writeStageEvent,
} from "./service.ts";

/**
 * Phase 4 acceptance loop endpoints.
 *
 * Three sub-routers — Master, Inspector, Owner — each role-gated and tenant-
 * scoped via the tenancy plugin. Every state mutation runs inside the tenant
 * transaction so the `search_path` and `FOR UPDATE` semantics survive together.
 *
 * Side-effects on Accept (next-stage unlock, property status promotion) are
 * marked `// PHASE-5-REPLACE` — Phase 5 will move them to BullMQ jobs that
 * subscribe to `acceptanceEvents` / poll the `stage_events` outbox.
 */

// biome-ignore lint/suspicious/noExplicitAny: convenience for tx row shapes from drizzle
type AnyRow = any;

async function presignedGetUrl(key: string): Promise<string | null> {
	if (!r2Client) return null;
	try {
		return r2Client.presign(key, { method: "GET", expiresIn: 600 });
	} catch {
		return null;
	}
}

// ============ MASTER ============

const masterRoutes = new Elysia({ prefix: "/master" })
	.use(tenancy)
	.use(requireRole("MASTER"))

	.get("/available-stages", async ({ user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [profile] = await tx
				.select()
				.from(masterProfiles)
				.where(eq(masterProfiles.userId, user.id))
				.limit(1);
			const specs = profile?.specializations ?? [];

			const rows = await tx
				.select({
					subStageInstanceId: subStageInstances.id,
					propertyId: stageInstances.propertyId,
					propertyName: properties.name,
					stageName: stageInstances.name,
					code: subStageInstances.code,
					name: subStageInstances.name,
					specialization: subStageInstances.specialization,
					wageAmount: subStageInstances.wageAmount,
					standardDurationDays: subStageInstances.standardDurationDays,
				})
				.from(subStageInstances)
				.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
				.innerJoin(properties, eq(properties.id, stageInstances.propertyId))
				.leftJoin(
					subStageAssignments,
					and(
						eq(subStageAssignments.subStageInstanceId, subStageInstances.id),
						isNull(subStageAssignments.releasedAt),
					),
				)
				.where(
					and(
						eq(subStageInstances.status, "AVAILABLE"),
						eq(subStageInstances.performerType, "MASTER"),
						isNull(subStageAssignments.id),
					),
				)
				.orderBy(
					asc(properties.createdAt),
					asc(stageInstances.order),
					asc(subStageInstances.order),
				);

			// Filter by specialization in app code so we don't have to build an
			// array overlap expression in drizzle; lists stay short.
			return rows.filter((r: AnyRow) => !r.specialization || specs.includes(r.specialization));
		});
	})

	.get("/my-stages", async ({ user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const assignments = await tx
				.select({ subStageInstanceId: subStageAssignments.subStageInstanceId })
				.from(subStageAssignments)
				.where(
					and(
						eq(subStageAssignments.masterUserId, user.id),
						isNull(subStageAssignments.releasedAt),
					),
				);
			if (assignments.length === 0) return [];
			const ids = assignments.map((a: AnyRow) => a.subStageInstanceId);
			const rows = await tx
				.select({
					subStageInstanceId: subStageInstances.id,
					propertyId: stageInstances.propertyId,
					propertyName: properties.name,
					stageName: stageInstances.name,
					code: subStageInstances.code,
					name: subStageInstances.name,
					specialization: subStageInstances.specialization,
					wageAmount: subStageInstances.wageAmount,
					standardDurationDays: subStageInstances.standardDurationDays,
					status: subStageInstances.status,
				})
				.from(subStageInstances)
				.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
				.innerJoin(properties, eq(properties.id, stageInstances.propertyId))
				.where(inArray(subStageInstances.id, ids))
				.orderBy(asc(properties.createdAt), asc(subStageInstances.order));
			return rows;
		});
	})

	.get("/stages/:subStageId", async ({ params, user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const detail = await loadStageDetail(tx, params.subStageId);
			if (!detail) {
				set.status = 404;
				return { error: "sub-stage not found" };
			}
			return detail;
		});
	})

	.post("/stages/:subStageId/take", async ({ params, user, tenant, runInTenant, set }) => {
		if (!runInTenant || !user || !tenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const ss = await lockSubStage(tx, params.subStageId);
			if (!ss) {
				set.status = 404;
				return { error: "sub-stage not found" };
			}
			if (ss.performer_type !== "MASTER") {
				set.status = 409;
				return { error: "sub-stage is not master-performed" };
			}
			if (ss.status !== "AVAILABLE") {
				set.status = 409;
				return { error: `sub-stage is ${ss.status}, not AVAILABLE` };
			}
			if (!(await isUnlocked(tx, params.subStageId))) {
				set.status = 409;
				return { error: "predecessor not accepted or stage manually blocked" };
			}
			// Specialization check
			if (ss.specialization) {
				const [profile] = await tx
					.select()
					.from(masterProfiles)
					.where(eq(masterProfiles.userId, user.id))
					.limit(1);
				const specs = profile?.specializations ?? [];
				if (!specs.includes(ss.specialization)) {
					set.status = 403;
					return { error: "specialization does not match" };
				}
			}
			// Insert assignment — unique partial index serializes concurrent takes.
			try {
				await tx
					.insert(subStageAssignments)
					.values({ subStageInstanceId: params.subStageId, masterUserId: user.id });
			} catch (_err) {
				set.status = 409;
				return { error: "another master has already claimed this stage" };
			}
			await tx
				.update(subStageInstances)
				.set({ status: "IN_PROGRESS" })
				.where(eq(subStageInstances.id, params.subStageId));

			const propertyId = await propertyIdForSubStage(tx, params.subStageId);
			await writeStageEvent(tx, tenant.schemaName, {
				type: "TAKEN_INTO_WORK",
				subStageInstanceId: params.subStageId,
				propertyId,
				actorUserId: user.id,
			});
			if (propertyId) {
				await maybeAdvancePropertyOnTake(tx, tenant.schemaName, propertyId, user.id);
			}
			return { ok: true };
		});
	})

	.post(
		"/stages/:subStageId/media/presign",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			if (!r2Client) {
				set.status = 503;
				return { error: "object storage not configured" };
			}
			return await runInTenant(async (tx) => {
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (!propertyId) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const assignment = await activeAssignment(tx, params.subStageId);
				if (!assignment || assignment.master_user_id !== user.id) {
					set.status = 403;
					return { error: "not your active claim" };
				}
				let presigned: ReturnType<typeof presignPropertyAssetUpload>;
				try {
					presigned = presignPropertyAssetUpload({
						tenantSchema: tenant.schemaName,
						propertyId,
						kind: "STAGE_PHOTO",
						contentType: body.contentType,
					});
				} catch (err) {
					set.status = 400;
					return { error: (err as Error).message };
				}
				const [asset] = await tx
					.insert(propertyAssets)
					.values({
						propertyId,
						kind: "STAGE_PHOTO",
						r2Key: presigned.key,
						contentType: body.contentType,
						uploadedBy: user.id,
					})
					.returning({ id: propertyAssets.id });
				if (!asset) throw new Error("failed to create asset record");
				return {
					assetId: asset.id,
					uploadUrl: presigned.url,
					key: presigned.key,
					expiresInSeconds: presigned.expiresInSeconds,
					bucket: r2Bucket,
				};
			});
		},
		{ body: zodBody(PresignStageMediaInput) },
	)

	.post(
		"/stages/:subStageId/media/attach",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (!propertyId) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const assignment = await activeAssignment(tx, params.subStageId);
				if (!assignment || assignment.master_user_id !== user.id) {
					set.status = 403;
					return { error: "not your active claim" };
				}
				const [asset] = await tx
					.select()
					.from(propertyAssets)
					.where(
						and(
							eq(propertyAssets.id, body.assetId),
							eq(propertyAssets.propertyId, propertyId),
							eq(propertyAssets.kind, "STAGE_PHOTO"),
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
				await tx
					.update(propertyAssets)
					.set({ uploadedAt: new Date() })
					.where(eq(propertyAssets.id, asset.id));
				try {
					await tx.insert(stageMediaAssets).values({
						subStageInstanceId: params.subStageId,
						assetId: asset.id,
						uploadedBy: user.id,
					});
				} catch {
					// Idempotent re-attach is fine.
				}
				return { ok: true, assetId: asset.id };
			});
		},
		{ body: zodBody(AttachStageMediaInput) },
	)

	.delete(
		"/stages/:subStageId/media/:assetId",
		async ({ params, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				// Masters can only remove media while the stage is still mutable
				// on their side. Once SUBMITTED/ACCEPTED, the photos are evidence
				// the inspector has acted on and must not vanish.
				if (ss.status !== "IN_PROGRESS" && ss.status !== "REJECTED") {
					set.status = 409;
					return { error: `cannot delete media when stage is ${ss.status}` };
				}
				const assignment = await activeAssignment(tx, params.subStageId);
				if (!assignment || assignment.master_user_id !== user.id) {
					set.status = 403;
					return { error: "not your active claim" };
				}
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (!propertyId) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const [asset] = await tx
					.select()
					.from(propertyAssets)
					.where(
						and(eq(propertyAssets.id, params.assetId), eq(propertyAssets.propertyId, propertyId)),
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
				// Ensure the asset is actually linked to this sub-stage — prevents
				// a master from deleting another stage's asset by id-guessing.
				const [link] = await tx
					.select({ id: stageMediaAssets.id })
					.from(stageMediaAssets)
					.where(
						and(
							eq(stageMediaAssets.subStageInstanceId, params.subStageId),
							eq(stageMediaAssets.assetId, asset.id),
						),
					)
					.limit(1);
				if (!link) {
					set.status = 404;
					return { error: "asset not linked to this sub-stage" };
				}
				// stage_media_assets cascades from property_assets, so deleting
				// the asset row clears the link too.
				await tx.delete(propertyAssets).where(eq(propertyAssets.id, asset.id));
				// Delete the R2 object only after the tx commits — otherwise a
				// rolled-back tx leaves the bucket short of an object the row
				// claims exists. Failure here is logged, not fatal: a periodic
				// reaper can sweep keys whose tenant prefix has no matching row.
				deferUntilCommit(tx, async () => {
					if (!r2Client) return;
					try {
						await r2Client.file(asset.r2Key).delete();
					} catch (err) {
						console.error("[media-detach] R2 delete failed", asset.r2Key, err);
					}
				});
				return { ok: true };
			});
		},
	)

	.post(
		"/stages/:subStageId/submit",
		async ({ params, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const assignment = await activeAssignment(tx, params.subStageId);
				if (!assignment || assignment.master_user_id !== user.id) {
					set.status = 403;
					return { error: "not your active claim" };
				}
				if (!canTransition(ss.status, "SUBMITTED")) {
					set.status = 409;
					return { error: `cannot submit from ${ss.status}` };
				}
				const missing = await missingRequiredMedia(tx, params.subStageId);
				if (missing.length > 0) {
					set.status = 400;
					return { error: "required media missing", missing };
				}
				try {
					await tx.insert(acceptanceRequests).values({
						subStageInstanceId: params.subStageId,
						submittedBy: user.id,
					});
				} catch {
					set.status = 409;
					return { error: "already submitted" };
				}
				await tx
					.update(subStageInstances)
					.set({ status: "SUBMITTED" })
					.where(eq(subStageInstances.id, params.subStageId));

				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				await writeStageEvent(tx, tenant.schemaName, {
					type: "SUBMITTED",
					subStageInstanceId: params.subStageId,
					propertyId,
					actorUserId: user.id,
				});
				const intentIds = await emitAcceptanceNotificationIntents(tx, tenant.schemaName, {
					type: "STAGE_SUBMITTED",
					subStageInstanceId: params.subStageId,
					propertyId,
				});
				// Phase 8 audit #4: enqueue MUST run after the tenant tx commits
				// — otherwise a worker can pick up the intent id before the row
				// is visible. `deferUntilCommit` drains hooks at the end of
				// `runInTenant`, after the transaction is durable.
				deferUntilCommit(tx, () => enqueueDispatchForIntents(tenant.schemaName, intentIds));
				return { ok: true };
			});
		},
		{ body: zodBody(SubmitForAcceptanceInput) },
	);

// ============ INSPECTOR ============

const inspectorRoutes = new Elysia({ prefix: "/inspector" })
	.use(tenancy)
	.use(requireRole("INSPECTOR"))

	.get("/queue", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			// Awaiting acceptance: submitted requests
			const submitted = await tx
				.select({
					subStageInstanceId: subStageInstances.id,
					propertyId: stageInstances.propertyId,
					propertyName: properties.name,
					stageName: stageInstances.name,
					code: subStageInstances.code,
					name: subStageInstances.name,
					performerType: subStageInstances.performerType,
					status: subStageInstances.status,
					acceptanceRequestId: acceptanceRequests.id,
					submittedBy: acceptanceRequests.submittedBy,
					submittedAt: acceptanceRequests.submittedAt,
				})
				.from(acceptanceRequests)
				.innerJoin(
					subStageInstances,
					eq(subStageInstances.id, acceptanceRequests.subStageInstanceId),
				)
				.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
				.innerJoin(properties, eq(properties.id, stageInstances.propertyId))
				.where(isNull(acceptanceRequests.resolvedAt))
				.orderBy(asc(acceptanceRequests.submittedAt));

			// Inspector-performed AVAILABLE sub-stages (e.g. Sub-stage 1.1)
			const direct = await tx
				.select({
					subStageInstanceId: subStageInstances.id,
					propertyId: stageInstances.propertyId,
					propertyName: properties.name,
					stageName: stageInstances.name,
					code: subStageInstances.code,
					name: subStageInstances.name,
					performerType: subStageInstances.performerType,
					status: subStageInstances.status,
				})
				.from(subStageInstances)
				.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
				.innerJoin(properties, eq(properties.id, stageInstances.propertyId))
				.where(
					and(
						eq(subStageInstances.performerType, "INSPECTOR"),
						eq(subStageInstances.status, "AVAILABLE"),
					),
				)
				.orderBy(asc(properties.createdAt), asc(subStageInstances.order));

			return { submitted, direct };
		});
	})

	.get("/stages/:subStageId", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const detail = await loadStageDetail(tx, params.subStageId);
			if (!detail) {
				set.status = 404;
				return { error: "sub-stage not found" };
			}
			return detail;
		});
	})

	.post(
		"/stages/:subStageId/media/presign",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			if (!r2Client) {
				set.status = 503;
				return { error: "object storage not configured" };
			}
			return await runInTenant(async (tx) => {
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (!propertyId) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				let presigned: ReturnType<typeof presignPropertyAssetUpload>;
				try {
					presigned = presignPropertyAssetUpload({
						tenantSchema: tenant.schemaName,
						propertyId,
						kind: body.kind,
						contentType: body.contentType,
					});
				} catch (err) {
					set.status = 400;
					return { error: (err as Error).message };
				}
				const [asset] = await tx
					.insert(propertyAssets)
					.values({
						propertyId,
						kind: body.kind,
						r2Key: presigned.key,
						contentType: body.contentType,
						uploadedBy: user.id,
					})
					.returning({ id: propertyAssets.id });
				if (!asset) throw new Error("failed to create asset record");
				return {
					assetId: asset.id,
					uploadUrl: presigned.url,
					key: presigned.key,
					expiresInSeconds: presigned.expiresInSeconds,
					bucket: r2Bucket,
				};
			});
		},
		{ body: zodBody(PresignInspectorMediaInput) },
	)

	.post(
		"/stages/:subStageId/media/attach",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (!propertyId) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const [asset] = await tx
					.select()
					.from(propertyAssets)
					.where(
						and(
							eq(propertyAssets.id, body.assetId),
							eq(propertyAssets.propertyId, propertyId),
							eq(propertyAssets.kind, body.kind),
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
				await tx
					.update(propertyAssets)
					.set({ uploadedAt: new Date() })
					.where(eq(propertyAssets.id, asset.id));
				if (body.kind === "BEFORE_PHOTO") {
					try {
						await tx.insert(stageMediaAssets).values({
							subStageInstanceId: params.subStageId,
							assetId: asset.id,
							uploadedBy: user.id,
						});
					} catch {
						// idempotent
					}
				}
				return { ok: true, assetId: asset.id };
			});
		},
		{ body: zodBody(AttachInspectorMediaInput) },
	)

	.delete(
		"/stages/:subStageId/media/:assetId",
		async ({ params, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				// Inspector can only remove BEFORE_PHOTO before submit-self, i.e.
				// while the inspector-performed stage is still AVAILABLE.
				if (ss.performer_type !== "INSPECTOR" || ss.status !== "AVAILABLE") {
					set.status = 409;
					return { error: `cannot delete media when stage is ${ss.status}` };
				}
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (!propertyId) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const [asset] = await tx
					.select()
					.from(propertyAssets)
					.where(
						and(eq(propertyAssets.id, params.assetId), eq(propertyAssets.propertyId, propertyId)),
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
				const [link] = await tx
					.select({ id: stageMediaAssets.id })
					.from(stageMediaAssets)
					.where(
						and(
							eq(stageMediaAssets.subStageInstanceId, params.subStageId),
							eq(stageMediaAssets.assetId, asset.id),
						),
					)
					.limit(1);
				if (!link) {
					set.status = 404;
					return { error: "asset not linked to this sub-stage" };
				}
				await tx.delete(propertyAssets).where(eq(propertyAssets.id, asset.id));
				deferUntilCommit(tx, async () => {
					if (!r2Client) return;
					try {
						await r2Client.file(asset.r2Key).delete();
					} catch (err) {
						console.error("[media-detach] R2 delete failed", asset.r2Key, err);
					}
				});
				return { ok: true };
			});
		},
	)

	.post(
		"/stages/:subStageId/submit-self",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				if (ss.performer_type !== "INSPECTOR") {
					set.status = 409;
					return { error: "sub-stage is not inspector-performed" };
				}
				if (!canTransition(ss.status, "SUBMITTED")) {
					set.status = 409;
					return { error: `cannot submit from ${ss.status}` };
				}
				if (!(await isUnlocked(tx, params.subStageId))) {
					set.status = 409;
					return { error: "predecessor not accepted or stage manually blocked" };
				}
				const missing = await missingRequiredMedia(tx, params.subStageId);
				if (missing.length > 0) {
					set.status = 400;
					return { error: "required media missing", missing };
				}
				try {
					await tx.insert(acceptanceRequests).values({
						subStageInstanceId: params.subStageId,
						submittedBy: user.id,
					});
				} catch {
					set.status = 409;
					return { error: "already submitted" };
				}
				await tx
					.update(subStageInstances)
					.set({ status: "SUBMITTED" })
					.where(eq(subStageInstances.id, params.subStageId));

				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				if (propertyId && body.materialsOnSite !== undefined) {
					await tx
						.update(properties)
						.set({ materialsOnSite: body.materialsOnSite, updatedAt: new Date() })
						.where(eq(properties.id, propertyId));
				}
				await writeStageEvent(tx, tenant.schemaName, {
					type: "SUBMITTED",
					subStageInstanceId: params.subStageId,
					propertyId,
					actorUserId: user.id,
				});
				// Inspector self-submit (e.g. Sub-stage 1.1): notify other
				// inspectors so any of them can pick up the acceptance.
				const intentIds = await emitAcceptanceNotificationIntents(tx, tenant.schemaName, {
					type: "STAGE_SUBMITTED",
					subStageInstanceId: params.subStageId,
					propertyId,
				});
				// Phase 8 audit #4: enqueue MUST run after the tenant tx commits
				// — otherwise a worker can pick up the intent id before the row
				// is visible. `deferUntilCommit` drains hooks at the end of
				// `runInTenant`, after the transaction is durable.
				deferUntilCommit(tx, () => enqueueDispatchForIntents(tenant.schemaName, intentIds));
				return { ok: true };
			});
		},
		{ body: zodBody(SubmitSelfInspectorInput) },
	)

	.post(
		"/stages/:subStageId/accept",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				if (!canTransition(ss.status, "ACCEPTED")) {
					set.status = 409;
					return { error: `cannot accept from ${ss.status}` };
				}
				const request = await activeAcceptanceRequest(tx, params.subStageId);
				if (!request) {
					set.status = 409;
					return { error: "no active acceptance request" };
				}

				// All checklist items must have a result and all must be passed.
				const items = await tx
					.select()
					.from(checklistItemInstances)
					.where(eq(checklistItemInstances.subStageInstanceId, params.subStageId));
				const passedById = new Map<string, { passed: boolean; note?: string | null }>();
				for (const r of body.results) {
					passedById.set(r.checklistItemInstanceId, { passed: r.passed, note: r.note ?? null });
				}
				for (const item of items) {
					const r = passedById.get(item.id);
					if (!r) {
						set.status = 400;
						return { error: `checklist item ${item.id} has no result` };
					}
					if (!r.passed) {
						set.status = 400;
						return { error: "all checklist items must pass; use reject instead" };
					}
				}

				// Persist checklist results (idempotent via unique constraint).
				for (const item of items) {
					const r = passedById.get(item.id);
					if (!r) continue;
					await tx
						.insert(checklistResults)
						.values({
							acceptanceRequestId: request.id,
							checklistItemInstanceId: item.id,
							passed: r.passed,
							note: r.note,
						})
						.onConflictDoNothing();
				}

				await tx
					.update(acceptanceRequests)
					.set({ resolution: "ACCEPTED", resolvedAt: new Date(), resolvedBy: user.id })
					.where(eq(acceptanceRequests.id, request.id));
				await tx
					.update(subStageInstances)
					.set({ status: "ACCEPTED" })
					.where(eq(subStageInstances.id, params.subStageId));
				// Release the master claim, if any.
				await tx
					.update(subStageAssignments)
					.set({ releasedAt: new Date() })
					.where(
						and(
							eq(subStageAssignments.subStageInstanceId, params.subStageId),
							isNull(subStageAssignments.releasedAt),
						),
					);

				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				// Phase 5: the ACCEPTED event is the seam BullMQ subscribes to.
				// The wage-credit + stage-propagate jobs run async; this route
				// returns as soon as the row updates commit.
				await writeStageEvent(tx, tenant.schemaName, {
					type: "ACCEPTED",
					subStageInstanceId: params.subStageId,
					propertyId,
					actorUserId: user.id,
				});
				return { ok: true };
			});
		},
		{ body: zodBody(AcceptInput) },
	)

	.post(
		"/stages/:subStageId/reject",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				if (!canTransition(ss.status, "REJECTED")) {
					set.status = 409;
					return { error: `cannot reject from ${ss.status}` };
				}
				const request = await activeAcceptanceRequest(tx, params.subStageId);
				if (!request) {
					set.status = 409;
					return { error: "no active acceptance request" };
				}
				if (body.defectAssetId) {
					const [asset] = await tx
						.select({ id: propertyAssets.id, r2Key: propertyAssets.r2Key })
						.from(propertyAssets)
						.where(eq(propertyAssets.id, body.defectAssetId))
						.limit(1);
					if (!asset) {
						set.status = 404;
						return { error: "defect asset not found" };
					}
					if (!tenantOwnsKey(tenant.schemaName, asset.r2Key)) {
						set.status = 403;
						return { error: "defect asset does not belong to this tenant" };
					}
				}
				// Persist any partial checklist results provided.
				if (body.results) {
					for (const r of body.results) {
						await tx
							.insert(checklistResults)
							.values({
								acceptanceRequestId: request.id,
								checklistItemInstanceId: r.checklistItemInstanceId,
								passed: r.passed,
								note: r.note ?? null,
							})
							.onConflictDoNothing();
					}
				}
				await tx.insert(rejections).values({
					acceptanceRequestId: request.id,
					comment: body.comment,
					defectAssetId: body.defectAssetId ?? null,
					rejectedBy: user.id,
				});
				await tx
					.update(acceptanceRequests)
					.set({ resolution: "REJECTED", resolvedAt: new Date(), resolvedBy: user.id })
					.where(eq(acceptanceRequests.id, request.id));
				// Inspector-performed stages return to AVAILABLE (no claim to keep);
				// master-performed stages return to IN_PROGRESS (claim stays).
				const nextStatus = ss.performer_type === "INSPECTOR" ? "AVAILABLE" : "IN_PROGRESS";
				await tx
					.update(subStageInstances)
					.set({ status: nextStatus })
					.where(eq(subStageInstances.id, params.subStageId));

				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				// Phase 6: recompute the assigned master's rating counters on REJECTED.
				// Accept flows recompute via the stage-propagate worker; reject has no
				// downstream worker, so do it inline.
				if (ss.performer_type === "MASTER") {
					const assignment = await activeAssignment(tx, params.subStageId);
					if (assignment) {
						await recomputeMasterRating(tx, assignment.master_user_id);
					}
				}
				await writeStageEvent(tx, tenant.schemaName, {
					type: "REJECTED",
					subStageInstanceId: params.subStageId,
					propertyId,
					actorUserId: user.id,
					payload: { comment: body.comment },
				});
				const intentIds = await emitAcceptanceNotificationIntents(tx, tenant.schemaName, {
					type: "STAGE_REJECTED",
					subStageInstanceId: params.subStageId,
					propertyId,
					payload: { comment: body.comment },
				});
				// Phase 8 audit #4: enqueue MUST run after the tenant tx commits
				// — otherwise a worker can pick up the intent id before the row
				// is visible. `deferUntilCommit` drains hooks at the end of
				// `runInTenant`, after the transaction is durable.
				deferUntilCommit(tx, () => enqueueDispatchForIntents(tenant.schemaName, intentIds));
				return { ok: true };
			});
		},
		{ body: zodBody(RejectInput) },
	)

	.post(
		"/stages/:subStageId/manual-override",
		async ({ params, body, user, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const ss = await lockSubStage(tx, params.subStageId);
				if (!ss) {
					set.status = 404;
					return { error: "sub-stage not found" };
				}
				const propertyId = await propertyIdForSubStage(tx, params.subStageId);
				const eventType: "MANUAL_BLOCKED" | "MANUAL_UNBLOCKED" =
					body.action === "BLOCK" ? "MANUAL_BLOCKED" : "MANUAL_UNBLOCKED";

				if (body.action === "BLOCK") {
					// Block is a property of the sub-stage itself so it persists even
					// for root sub-stages with no incoming deps.
					await tx
						.update(subStageInstances)
						.set({
							manualBlocked: true,
							manualBlockedBy: user.id,
							manualBlockedAt: new Date(),
							manualBlockedReason: body.reason,
						})
						.where(eq(subStageInstances.id, params.subStageId));
					if (ss.status === "AVAILABLE") {
						await tx
							.update(subStageInstances)
							.set({ status: "LOCKED" })
							.where(eq(subStageInstances.id, params.subStageId));
					}
				} else if (body.action === "UNBLOCK") {
					await tx
						.update(subStageInstances)
						.set({
							manualBlocked: false,
							manualBlockedBy: null,
							manualBlockedAt: null,
							manualBlockedReason: null,
						})
						.where(eq(subStageInstances.id, params.subStageId));
					if (ss.status === "LOCKED" && (await isUnlocked(tx, params.subStageId))) {
						await tx
							.update(subStageInstances)
							.set({ status: "AVAILABLE" })
							.where(eq(subStageInstances.id, params.subStageId));
					}
				} else {
					// FORCE_UNBLOCK: skip predecessor checks by flagging every incoming
					// dep edge as UNBLOCKED, and clear any manual block on this row too.
					await tx
						.update(subStageInstances)
						.set({
							manualBlocked: false,
							manualBlockedBy: null,
							manualBlockedAt: null,
							manualBlockedReason: null,
						})
						.where(eq(subStageInstances.id, params.subStageId));
					await tx
						.update(stageInstanceDependencies)
						.set({
							manualOverride: "UNBLOCKED",
							overrideBy: user.id,
							overrideAt: new Date(),
							overrideReason: body.reason,
						})
						.where(eq(stageInstanceDependencies.subStageInstanceId, params.subStageId));
					if (ss.status === "LOCKED" && (await isUnlocked(tx, params.subStageId))) {
						await tx
							.update(subStageInstances)
							.set({ status: "AVAILABLE" })
							.where(eq(subStageInstances.id, params.subStageId));
					}
				}
				await writeStageEvent(tx, tenant.schemaName, {
					type: eventType,
					subStageInstanceId: params.subStageId,
					propertyId,
					actorUserId: user.id,
					payload: { action: body.action, reason: body.reason },
				});
				const intentType = eventType === "MANUAL_BLOCKED" ? "STAGE_BLOCKED" : "STAGE_UNBLOCKED";
				const intentIds = await emitAcceptanceNotificationIntents(tx, tenant.schemaName, {
					type: intentType,
					subStageInstanceId: params.subStageId,
					propertyId,
					payload: { reason: body.reason },
				});
				// Phase 8 audit #4: enqueue MUST run after the tenant tx commits
				// — otherwise a worker can pick up the intent id before the row
				// is visible. `deferUntilCommit` drains hooks at the end of
				// `runInTenant`, after the transaction is durable.
				deferUntilCommit(tx, () => enqueueDispatchForIntents(tenant.schemaName, intentIds));
				return { ok: true };
			});
		},
		{ body: zodBody(ManualOverrideInput) },
	);

// ============ shared loader ============

async function loadStageDetail(tx: AnyRow, subStageInstanceId: string) {
	const [ss] = await tx
		.select()
		.from(subStageInstances)
		.where(eq(subStageInstances.id, subStageInstanceId))
		.limit(1);
	if (!ss) return null;
	const [stage] = await tx
		.select()
		.from(stageInstances)
		.where(eq(stageInstances.id, ss.stageInstanceId))
		.limit(1);
	if (!stage) return null;
	const [prop] = await tx
		.select({
			id: properties.id,
			name: properties.name,
			status: properties.status,
			materialsOnSite: properties.materialsOnSite,
		})
		.from(properties)
		.where(eq(properties.id, stage.propertyId))
		.limit(1);
	if (!prop) return null;

	const [items, reqs] = await Promise.all([
		tx
			.select()
			.from(checklistItemInstances)
			.where(eq(checklistItemInstances.subStageInstanceId, ss.id))
			.orderBy(asc(checklistItemInstances.order)),
		tx
			.select()
			.from(mediaRequirementInstances)
			.where(eq(mediaRequirementInstances.subStageInstanceId, ss.id)),
	]);

	const mediaRows = await tx
		.select({
			id: stageMediaAssets.id,
			assetId: propertyAssets.id,
			kind: propertyAssets.kind,
			contentType: propertyAssets.contentType,
			r2Key: propertyAssets.r2Key,
			uploadedBy: stageMediaAssets.uploadedBy,
			uploadedAt: propertyAssets.uploadedAt,
		})
		.from(stageMediaAssets)
		.innerJoin(propertyAssets, eq(propertyAssets.id, stageMediaAssets.assetId))
		.where(eq(stageMediaAssets.subStageInstanceId, ss.id))
		.orderBy(desc(propertyAssets.uploadedAt));

	const media = await Promise.all(
		mediaRows.map(async (m: AnyRow) => ({
			id: m.id,
			assetId: m.assetId,
			kind: m.kind,
			contentType: m.contentType,
			r2Key: m.r2Key,
			uploadedBy: m.uploadedBy,
			uploadedAt:
				typeof m.uploadedAt === "string" ? m.uploadedAt : (m.uploadedAt as Date).toISOString(),
			url: await presignedGetUrl(m.r2Key),
		})),
	);

	const assignment = await activeAssignment(tx, ss.id);
	const request = await activeAcceptanceRequest(tx, ss.id);

	const previousResults: AnyRow[] = request
		? await tx
				.select({
					checklistItemInstanceId: checklistResults.checklistItemInstanceId,
					passed: checklistResults.passed,
					note: checklistResults.note,
				})
				.from(checklistResults)
				.where(eq(checklistResults.acceptanceRequestId, request.id))
		: [];

	return {
		subStage: {
			...ss,
			checklistItems: items,
			mediaRequirements: reqs,
		},
		stageName: stage.name,
		property: prop,
		assignment: assignment
			? {
					masterUserId: assignment.master_user_id,
					claimedAt:
						typeof assignment.claimed_at === "string"
							? assignment.claimed_at
							: (assignment.claimed_at as unknown as Date).toISOString(),
				}
			: null,
		activeRequest: request
			? {
					id: request.id,
					submittedBy: request.submittedBy,
					submittedAt:
						typeof request.submittedAt === "string"
							? request.submittedAt
							: (request.submittedAt as Date).toISOString(),
				}
			: null,
		media,
		previousResults,
	};
}

export const acceptanceRoutes = new Elysia().use(masterRoutes).use(inspectorRoutes);
