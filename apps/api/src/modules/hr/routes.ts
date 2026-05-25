import {
	masterBalances,
	masterProfiles,
	masterRatings,
	properties,
	stageInstances,
	subStageAssignments,
	subStageInstances,
} from "@repo/db/schema/tenant";

// (no rating compute here; that lives in @repo/acceptance/rating)
import { UpdateAvailabilityInput, UpdateMasterInput } from "@repo/validators";
import { desc, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";

// biome-ignore lint/suspicious/noExplicitAny: drizzle row types
type AnyRow = any;

/**
 * Build the roster payload — one row per master with availability derived from
 * an active assignment or the manual override window. Used by both the owner
 * (full read/edit) and inspector (read-only) endpoints.
 */
async function loadRoster(tx: AnyRow) {
	const profiles = await tx.select().from(masterProfiles).orderBy(desc(masterProfiles.createdAt));
	if (profiles.length === 0) return [];

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
	return profiles.map((p: AnyRow) => {
		const active = activeByUser.get(p.userId);
		let availability: { state: string; detail: string | null; until: string | null };
		if (p.availabilityOverrideUntil && p.availabilityOverrideUntil > now) {
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
			id: p.id,
			userId: p.userId,
			displayName: p.displayName,
			phone: p.phone,
			specializations: p.specializations,
			availability,
			rating: ratingByUser.get(p.userId) ?? null,
			balance: balanceByUser.get(p.userId)?.balance ?? "0",
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

	.get("", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant((tx) => loadRoster(tx));
	})

	.get("/:id", async ({ params, runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant(async (tx) => {
			const [profile] = await tx
				.select()
				.from(masterProfiles)
				.where(eq(masterProfiles.id, params.id))
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
				rating: rating ?? null,
				balance: balance?.balance ?? "0",
				recentAssignments,
			};
		});
	})

	.patch(
		"/:id",
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
					.where(eq(masterProfiles.id, params.id))
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
		"/:id/availability",
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
					.where(eq(masterProfiles.id, params.id))
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

	.get("", async ({ runInTenant, set }) => {
		if (!runInTenant) {
			set.status = 401;
			return { error: "no tenant" };
		}
		return await runInTenant((tx) => loadRoster(tx));
	});

export const hrRoutes = new Elysia().use(ownerRoutes).use(inspectorRoutes);
