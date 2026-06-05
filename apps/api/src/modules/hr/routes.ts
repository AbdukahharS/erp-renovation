import { computeRatingScore } from "@repo/acceptance/rating";
import { tenantConfig, tenantMemberships, user as users } from "@repo/db/schema/control";
import {
	masterBalances,
	masterProfiles,
	masterRatings,
	properties,
	stageInstances,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";

import { UpdateAvailabilityInput, UpdateMasterInput } from "@repo/validators";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";

const DEFAULT_WEIGHTS = { speed: 0.5, defect: 0.5 };

async function loadRatingWeights(tenantId: string): Promise<{ speed: number; defect: number }> {
	const [cfg] = await db
		.select({ ratingWeights: tenantConfig.ratingWeights })
		.from(tenantConfig)
		.where(eq(tenantConfig.tenantId, tenantId))
		.limit(1);
	return cfg?.ratingWeights ?? DEFAULT_WEIGHTS;
}

function withScore(
	rating: { acceptedCount: number; rejectedCount: number; avgDurationRatio: string | null } | null,
	weights: { speed: number; defect: number },
) {
	if (!rating) return null;
	const score = computeRatingScore(
		{
			acceptedCount: rating.acceptedCount,
			rejectedCount: rating.rejectedCount,
			avgDurationRatio: rating.avgDurationRatio !== null ? Number(rating.avgDurationRatio) : null,
		},
		weights,
	);
	return { ...rating, score };
}

// biome-ignore lint/suspicious/noExplicitAny: drizzle row types
type AnyRow = any;

/**
 * Build the roster payload — one row per enlisted tenant member (Master,
 * Inspector, Procurement; Owner excluded). Masters carry profile/specs/rating/
 * balance; non-masters fall back to the user's name + role. Used by both the
 * owner (full read/edit) and inspector (read-only) endpoints.
 */
async function loadRoster(
	tenantId: string,
	tx: AnyRow,
	weights: { speed: number; defect: number },
) {
	const members = await db
		.select({
			userId: tenantMemberships.userId,
			role: tenantMemberships.role,
			createdAt: tenantMemberships.createdAt,
			name: users.name,
			email: users.email,
		})
		.from(tenantMemberships)
		.innerJoin(users, eq(users.id, tenantMemberships.userId))
		.where(and(eq(tenantMemberships.tenantId, tenantId), ne(tenantMemberships.role, "OWNER")))
		.orderBy(desc(tenantMemberships.createdAt));
	if (members.length === 0) return [];

	const profiles = await tx.select().from(masterProfiles);
	const profileByUser = new Map<string, AnyRow>(profiles.map((p: AnyRow) => [p.userId, p]));

	const ratings = await tx.select().from(masterRatings);
	const ratingByUser = new Map<string, AnyRow>(ratings.map((r: AnyRow) => [r.masterUserId, r]));

	const balances = await tx.select().from(masterBalances);
	const balanceByUser = new Map<string, AnyRow>(balances.map((b: AnyRow) => [b.masterUserId, b]));

	const activeAssignments = await tx
		.select({
			masterUserId: subStageAssignments.masterUserId,
			propertyId: stageInstances.propertyId,
			propertyName: properties.name,
			subStageName: subStageInstances.name,
			standardDurationDays: subStageInstances.standardDurationDays,
			claimedAt: subStageAssignments.claimedAt,
		})
		.from(subStageAssignments)
		.innerJoin(subStageInstances, eq(subStageInstances.id, subStageAssignments.subStageInstanceId))
		.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
		.innerJoin(properties, eq(properties.id, stageInstances.propertyId))
		.where(isNull(subStageAssignments.releasedAt));
	const activeByUser = new Map<string, AnyRow>(
		activeAssignments.map((a: AnyRow) => [a.masterUserId, a]),
	);

	const now = new Date();
	return members.map((m: AnyRow) => {
		const p = profileByUser.get(m.userId);
		const active = activeByUser.get(m.userId);
		let availability: { state: string; detail: string | null; until: string | null };
		if (p?.availabilityOverrideUntil && p.availabilityOverrideUntil > now) {
			availability = {
				state: "UNAVAILABLE",
				detail: p.availabilityOverride ?? "Unavailable",
				until: (p.availabilityOverrideUntil as Date).toISOString(),
			};
		} else if (active) {
			const eta = new Date(
				(active.claimedAt as Date).getTime() + (active.standardDurationDays as number) * 86400_000,
			);
			availability = {
				state: "WORKING",
				detail: `On ${active.propertyName} (${active.subStageName})`,
				until: eta.toISOString(),
			};
		} else {
			availability = { state: "AVAILABLE", detail: null, until: null };
		}
		return {
			id: p?.id ?? m.userId,
			userId: m.userId,
			role: m.role,
			displayName: p?.displayName ?? m.name ?? m.email,
			phone: p?.phone ?? null,
			specializations: p?.specializations ?? [],
			availability,
			rating: withScore(ratingByUser.get(m.userId) ?? null, weights),
			balance: balanceByUser.get(m.userId)?.balance ?? "0",
		};
	});
}

/**
 * Phase 6 HR routes — owner-facing roster management. Replaces the old
 * owner/master-profiles endpoints from acceptance/routes.ts (Phase 6 moves
 * roster onboarding to invitations + this read/edit surface).
 */
const ownerRoutes = new Elysia({ prefix: "/owner/masters" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	.get("", async ({ tenant, runInTenant, set }) => {
		if (!runInTenant || !tenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const weights = await loadRatingWeights(tenant.id);
		return await runInTenant((tx) => loadRoster(tenant.id, tx, weights));
	})

	.get("/:masterId", async ({ tenant, params, runInTenant, set }) => {
		if (!runInTenant || !tenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const weights = await loadRatingWeights(tenant.id);
		return await runInTenant(async (tx) => {
			const [profile] = await tx
				.select()
				.from(masterProfiles)
				.where(eq(masterProfiles.id, params.masterId))
				.limit(1);
			if (!profile) {
				set.status = 404;
				return { error: "master not found" };
			}
			const [rating] = await tx
				.select()
				.from(masterRatings)
				.where(eq(masterRatings.masterUserId, profile.userId))
				.limit(1);
			const [balance] = await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, profile.userId))
				.limit(1);
			const recentAssignments = await tx
				.select({
					subStageInstanceId: subStageAssignments.subStageInstanceId,
					propertyId: stageInstances.propertyId,
					propertyName: properties.name,
					subStageName: subStageInstances.name,
					status: subStageInstances.status,
					claimedAt: subStageAssignments.claimedAt,
					releasedAt: subStageAssignments.releasedAt,
				})
				.from(subStageAssignments)
				.innerJoin(
					subStageInstances,
					eq(subStageInstances.id, subStageAssignments.subStageInstanceId),
				)
				.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
				.innerJoin(properties, eq(properties.id, stageInstances.propertyId))
				.where(eq(subStageAssignments.masterUserId, profile.userId))
				.orderBy(desc(subStageAssignments.claimedAt))
				.limit(20);
			return {
				profile,
				rating: withScore(rating ?? null, weights),
				balance: balance?.balance ?? "0",
				recentAssignments,
			};
		});
	})

	.patch(
		"/:masterId",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const updates: Record<string, unknown> = { updatedAt: new Date() };
				if (body.displayName !== undefined) updates.displayName = body.displayName;
				if (body.phone !== undefined) updates.phone = body.phone;
				if (body.specializations !== undefined) updates.specializations = body.specializations;
				const [row] = await tx
					.update(masterProfiles)
					.set(updates)
					.where(eq(masterProfiles.id, params.masterId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "master not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateMasterInput) },
	)

	.patch(
		"/:masterId/availability",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(masterProfiles)
					.set({
						availabilityOverride: body.availabilityOverride,
						availabilityOverrideUntil: body.availabilityOverrideUntil
							? new Date(body.availabilityOverrideUntil)
							: null,
						updatedAt: new Date(),
					})
					.where(eq(masterProfiles.id, params.masterId))
					.returning();
				if (!row) {
					set.status = 404;
					return { error: "master not found" };
				}
				return row;
			});
		},
		{ body: zodBody(UpdateAvailabilityInput) },
	);

// Inspector read-only view — PHASE-6 §6.3 / DoD: "Master availability …
// is visible to Owner and Inspector." Same payload as owner, no mutations.
const inspectorRoutes = new Elysia({ prefix: "/inspector/masters" })
	.use(tenancy)
	.use(requireRole("INSPECTOR"))

	.get("", async ({ tenant, runInTenant, set }) => {
		if (!runInTenant || !tenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const weights = await loadRatingWeights(tenant.id);
		return await runInTenant((tx) => loadRoster(tenant.id, tx, weights));
	});

// Master self-view — returns the caller's own profile (incl. specializations),
// rating, and balance from the active tenant. Backs /master/profile in the PWA.
const masterRoutes = new Elysia({ prefix: "/master" })
	.use(tenancy)
	.use(requireRole("MASTER"))

	.get("/me", async ({ user, tenant, runInTenant, set }) => {
		if (!runInTenant || !tenant || !user) {
			set.status = 401;
			return { error: "no tenant" };
		}
		const weights = await loadRatingWeights(tenant.id);
		return await runInTenant(async (tx) => {
			const [profile] = await tx
				.select()
				.from(masterProfiles)
				.where(eq(masterProfiles.userId, user.id))
				.limit(1);
			if (!profile) {
				set.status = 404;
				return { error: "master profile not found" };
			}
			const [rating] = await tx
				.select()
				.from(masterRatings)
				.where(eq(masterRatings.masterUserId, user.id))
				.limit(1);
			const [balance] = await tx
				.select()
				.from(masterBalances)
				.where(eq(masterBalances.masterUserId, user.id))
				.limit(1);
			return {
				profile,
				rating: withScore(rating ?? null, weights),
				balance: balance?.balance ?? "0",
			};
		});
	});

export const hrRoutes = new Elysia().use(ownerRoutes).use(inspectorRoutes).use(masterRoutes);
