import { tenants } from "@repo/db/schema/control";
import {
	acceptanceRequests,
	properties,
	propertyAssets,
	propertyShareLinks,
	stageInstances,
	stageMediaAssets,
	subStageInstances,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { ShareLinkAuthInput } from "@repo/validators";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { r2Client } from "../../lib/r2.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { signShareToken, verifyShareToken } from "./jwt.ts";

/**
 * Public, password-protected per-property progress view. Bypasses the tenancy
 * plugin: tenant is resolved from `:tenantSlug` in the control plane, then the
 * tenant schema is entered manually via `withTenant`. No financial fields are
 * ever included in the response.
 */

async function presignedGetUrl(key: string): Promise<string | null> {
	if (!r2Client) return null;
	try {
		return r2Client.presign(key, { method: "GET", expiresIn: 3600 });
	} catch {
		return null;
	}
}

export const publicPropertyShareRoutes = new Elysia({ prefix: "/public/property-share" })
	.post(
		"/:tenantSlug/:linkSlug/auth",
		async ({ params, body, set }) => {
			const [tenantRow] = await db
				.select({ id: tenants.id, schemaName: tenants.schemaName, status: tenants.status })
				.from(tenants)
				.where(eq(tenants.slug, params.tenantSlug))
				.limit(1);
			if (!tenantRow || tenantRow.status !== "ACTIVE") {
				set.status = 404;
				return { error: "not found" };
			}

			const result = await withTenant(db, tenantRow.schemaName, async (tx) => {
				const [link] = await tx
					.select({
						id: propertyShareLinks.id,
						propertyId: propertyShareLinks.propertyId,
						passwordHash: propertyShareLinks.passwordHash,
						revokedAt: propertyShareLinks.revokedAt,
						updatedAt: propertyShareLinks.updatedAt,
					})
					.from(propertyShareLinks)
					.where(eq(propertyShareLinks.slug, params.linkSlug))
					.limit(1);
				return link ?? null;
			});

			if (!result || result.revokedAt) {
				set.status = 401;
				return { error: "invalid credentials" };
			}
			const ok = await Bun.password.verify(body.password, result.passwordHash);
			if (!ok) {
				set.status = 401;
				return { error: "invalid credentials" };
			}

			const token = await signShareToken({
				tenantId: tenantRow.id,
				linkId: result.id,
				propertyId: result.propertyId,
				pwUpdatedAt: Math.floor(result.updatedAt.getTime() / 1000),
			});
			return { token, expiresInSeconds: 8 * 60 * 60 };
		},
		{ body: zodBody(ShareLinkAuthInput) },
	)

	.get("/view", async ({ request, set }) => {
		const auth = request.headers.get("authorization") ?? "";
		const m = /^Bearer\s+(.+)$/i.exec(auth);
		if (!m) {
			set.status = 401;
			return { error: "missing token" };
		}
		const tokenStr = m[1];
		if (!tokenStr) {
			set.status = 401;
			return { error: "missing token" };
		}
		const payload = await verifyShareToken(tokenStr);
		if (!payload) {
			set.status = 401;
			return { error: "invalid token" };
		}
		const [tenantRow] = await db
			.select({ schemaName: tenants.schemaName, status: tenants.status })
			.from(tenants)
			.where(eq(tenants.id, payload.tenantId))
			.limit(1);
		if (!tenantRow || tenantRow.status !== "ACTIVE") {
			set.status = 401;
			return { error: "tenant unavailable" };
		}

		const result = await withTenant(db, tenantRow.schemaName, async (tx) => {
			const [link] = await tx
				.select({
					id: propertyShareLinks.id,
					propertyId: propertyShareLinks.propertyId,
					revokedAt: propertyShareLinks.revokedAt,
					updatedAt: propertyShareLinks.updatedAt,
				})
				.from(propertyShareLinks)
				.where(eq(propertyShareLinks.id, payload.linkId))
				.limit(1);
			if (!link || link.revokedAt) return { kind: "auth" as const };
			if (Math.floor(link.updatedAt.getTime() / 1000) !== payload.pwUpdatedAt) {
				return { kind: "auth" as const };
			}

			const [prop] = await tx
				.select({
					id: properties.id,
					name: properties.name,
					address: properties.address,
					areaSqm: properties.areaSqm,
					status: properties.status,
					deadlineAt: properties.deadlineAt,
				})
				.from(properties)
				.where(eq(properties.id, link.propertyId))
				.limit(1);
			if (!prop) return { kind: "notfound" as const };

			const stageRows = await tx
				.select({
					id: stageInstances.id,
					order: stageInstances.order,
					name: stageInstances.name,
				})
				.from(stageInstances)
				.where(eq(stageInstances.propertyId, prop.id))
				.orderBy(asc(stageInstances.order));

			const stageIds = stageRows.map((s) => s.id);
			const subStageRows = stageIds.length
				? await tx
						.select({
							id: subStageInstances.id,
							stageInstanceId: subStageInstances.stageInstanceId,
							order: subStageInstances.order,
							code: subStageInstances.code,
							name: subStageInstances.name,
							performerType: subStageInstances.performerType,
							status: subStageInstances.status,
							standardDurationDays: subStageInstances.standardDurationDays,
						})
						.from(subStageInstances)
						.where(inArray(subStageInstances.stageInstanceId, stageIds))
						.orderBy(asc(subStageInstances.order))
				: [];

			const subStageIds = subStageRows.map((s) => s.id);

			const acceptedRequests = subStageIds.length
				? await tx
						.select({
							subStageInstanceId: acceptanceRequests.subStageInstanceId,
							resolvedAt: acceptanceRequests.resolvedAt,
						})
						.from(acceptanceRequests)
						.where(
							and(
								inArray(acceptanceRequests.subStageInstanceId, subStageIds),
								eq(acceptanceRequests.resolution, "ACCEPTED"),
							),
						)
				: [];
			const acceptedAtBySub = new Map<string, Date | null>();
			for (const r of acceptedRequests) {
				acceptedAtBySub.set(r.subStageInstanceId, r.resolvedAt);
			}

			const acceptedSubStageIds = subStageRows
				.filter((s) => s.status === "ACCEPTED")
				.map((s) => s.id);
			const mediaRows = acceptedSubStageIds.length
				? await tx
						.select({
							id: stageMediaAssets.id,
							subStageInstanceId: stageMediaAssets.subStageInstanceId,
							assetId: propertyAssets.id,
							r2Key: propertyAssets.r2Key,
							contentType: propertyAssets.contentType,
							uploadedAt: propertyAssets.uploadedAt,
						})
						.from(stageMediaAssets)
						.innerJoin(propertyAssets, eq(propertyAssets.id, stageMediaAssets.assetId))
						.where(
							and(
								inArray(stageMediaAssets.subStageInstanceId, acceptedSubStageIds),
								// Only photo-like content; ignore videos in the customer view
								// (still allowed in tenant; just keep the gallery image-only).
								inArray(propertyAssets.contentType, ["image/jpeg", "image/png", "image/webp"]),
							),
						)
				: [];

			const photosBySub = new Map<
				string,
				Array<{
					id: string;
					url: string | null;
					contentType: string;
					uploadedAt: string;
				}>
			>();
			for (const m of mediaRows) {
				const url = await presignedGetUrl(m.r2Key);
				const arr = photosBySub.get(m.subStageInstanceId) ?? [];
				arr.push({
					id: m.assetId,
					url,
					contentType: m.contentType,
					uploadedAt: m.uploadedAt.toISOString(),
				});
				photosBySub.set(m.subStageInstanceId, arr);
			}

			return {
				kind: "ok" as const,
				prop,
				stageRows,
				subStageRows,
				acceptedAtBySub,
				photosBySub,
			};
		});

		if (result.kind === "auth") {
			set.status = 401;
			return { error: "link not active" };
		}
		if (result.kind === "notfound") {
			set.status = 404;
			return { error: "property not found" };
		}

		const subsByStage = new Map<string, typeof result.subStageRows>();
		for (const s of result.subStageRows) {
			const arr = subsByStage.get(s.stageInstanceId) ?? [];
			arr.push(s);
			subsByStage.set(s.stageInstanceId, arr);
		}

		const now = Date.now();
		let runningEnd = now;
		let currentStageEndsAt: Date | null = null;
		const stages = result.stageRows.map((s) => {
			const subs = subsByStage.get(s.id) ?? [];
			const total = subs.length;
			const accepted = subs.filter((x) => x.status === "ACCEPTED").length;
			const progressPct = total === 0 ? 0 : Math.round((accepted * 100) / total);

			const remainingDays = subs
				.filter((x) => x.status !== "ACCEPTED")
				.reduce((sum, x) => sum + x.standardDurationDays, 0);
			runningEnd += remainingDays * 86_400_000;
			if (currentStageEndsAt === null && subs.some((x) => x.status !== "ACCEPTED")) {
				currentStageEndsAt = new Date(runningEnd);
			}

			return {
				id: s.id,
				order: s.order,
				name: s.name,
				progressPct,
				subStages: subs.map((ss) => ({
					id: ss.id,
					code: ss.code,
					name: ss.name,
					performerType: ss.performerType,
					status: ss.status,
					standardDurationDays: ss.standardDurationDays,
					acceptedAt: result.acceptedAtBySub.get(ss.id)?.toISOString() ?? null,
					photos: result.photosBySub.get(ss.id) ?? [],
				})),
			};
		});

		const propertyEndsAt = runningEnd === now ? null : new Date(runningEnd).toISOString();

		return {
			property: {
				name: result.prop.name,
				address: result.prop.address,
				areaSqm: result.prop.areaSqm,
				status: result.prop.status,
				deadlineAt: result.prop.deadlineAt?.toISOString() ?? null,
			},
			stages,
			computedEta: {
				currentStageEndsAt: currentStageEndsAt ? (currentStageEndsAt as Date).toISOString() : null,
				propertyEndsAt,
			},
		};
	});
