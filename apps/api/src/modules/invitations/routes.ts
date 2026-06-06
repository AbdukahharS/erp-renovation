import { randomBytes } from "node:crypto";
import { invitations, tenantMemberships, tenants } from "@repo/db/schema/control";
import { masterProfiles } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { CreateInvitationInput, RedeemInvitationInput } from "@repo/validators";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { auth } from "../auth/auth.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";

/**
 * Phase 6 invitation flow.
 *
 * Owner endpoints (tenant-scoped): create / list / revoke invitations.
 * Public endpoints: preview a token, redeem it to create a user + membership
 * + (for MASTER) a tenant-scoped masterProfile row.
 *
 * Tokens are 32 random bytes (hex) and serve as the primary key. Single-use
 * enforced by setting `consumedAt` atomically.
 */

function newToken(): string {
	return randomBytes(32).toString("hex");
}

const ownerInvitations = new Elysia({ prefix: "/owner/invitations" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	.post(
		"",
		async ({ body, user, tenant, set }) => {
			if (!user || !tenant) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			const token = newToken();
			const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 14) * 86400_000);
			const [row] = await db
				.insert(invitations)
				.values({
					token,
					tenantId: tenant.id,
					role: body.role,
					email: body.email ?? null,
					createdBy: user.id,
					expiresAt,
				})
				.returning();
			return row;
		},
		{ body: zodBody(CreateInvitationInput) },
	)

	.get("", async ({ tenant, set }) => {
		if (!tenant) {
			set.status = 401;
			return { error: "unauthorized" };
		}
		const rows = await db
			.select()
			.from(invitations)
			.where(eq(invitations.tenantId, tenant.id))
			.orderBy(desc(invitations.createdAt));
		return rows;
	})

	.delete("/:token", async ({ params, tenant, set }) => {
		if (!tenant) {
			set.status = 401;
			return { error: "unauthorized" };
		}
		// Only expire still-pending invitations; never rewrite a consumed row's
		// expiresAt — that would mutate a historical record.
		const [row] = await db
			.update(invitations)
			.set({ expiresAt: new Date() })
			.where(
				and(
					eq(invitations.token, params.token),
					eq(invitations.tenantId, tenant.id),
					isNull(invitations.consumedAt),
				),
			)
			.returning();
		if (!row) {
			// Differentiate: 409 if already consumed, 404 otherwise.
			const [existing] = await db
				.select({ consumedAt: invitations.consumedAt })
				.from(invitations)
				.where(and(eq(invitations.token, params.token), eq(invitations.tenantId, tenant.id)))
				.limit(1);
			if (existing?.consumedAt) {
				set.status = 409;
				return { error: "invitation already consumed" };
			}
			set.status = 404;
			return { error: "not found" };
		}
		return { ok: true };
	});

const publicInvitations = new Elysia({ prefix: "/invitations" })
	.get("/:token", async ({ params, set }) => {
		const [row] = await db
			.select({
				token: invitations.token,
				role: invitations.role,
				expiresAt: invitations.expiresAt,
				consumedAt: invitations.consumedAt,
				tenantName: tenants.name,
			})
			.from(invitations)
			.innerJoin(tenants, eq(tenants.id, invitations.tenantId))
			.where(eq(invitations.token, params.token))
			.limit(1);
		if (!row) {
			set.status = 404;
			return { error: "invitation not found" };
		}
		// For unusable tokens, surface the status (CONSUMED / EXPIRED) without
		// leaking tenant identity, so the UI can show a precise message instead
		// of a generic "not found".
		if (row.consumedAt) {
			return { status: "CONSUMED" as const };
		}
		if (row.expiresAt.getTime() <= Date.now()) {
			return { status: "EXPIRED" as const };
		}
		return {
			tenantName: row.tenantName,
			role: row.role,
			expiresAt: row.expiresAt.toISOString(),
			status: "PENDING" as const,
		};
	})

	.post(
		"/:token/redeem",
		async ({ params, body, set }) => {
			// Re-fetch and validate (read-only sanity check before any mutation).
			const [invite] = await db
				.select()
				.from(invitations)
				.where(eq(invitations.token, params.token))
				.limit(1);
			if (!invite) {
				set.status = 404;
				return { error: "invitation not found" };
			}
			if (invite.consumedAt) {
				set.status = 409;
				return { error: "invitation already used" };
			}
			if (invite.expiresAt.getTime() <= Date.now()) {
				set.status = 409;
				return { error: "invitation expired" };
			}

			// Atomically claim the token *before* creating the user. If signUpEmail
			// then fails, we roll the claim back so the operator/user can retry —
			// otherwise we'd leave an orphaned user and a still-PENDING token, and
			// the retry would 409 on email-already-registered without ever consuming.
			// Two concurrent redeems race here on the `isNull(consumedAt)` guard;
			// the loser sees a 409, never creates a user.
			const claim = await db
				.update(invitations)
				.set({ consumedAt: new Date() })
				.where(and(eq(invitations.token, params.token), isNull(invitations.consumedAt)))
				.returning({ token: invitations.token });
			if (claim.length === 0) {
				set.status = 409;
				return { error: "invitation already used" };
			}

			let userId: string;
			try {
				const signUp = await auth.api.signUpEmail({
					body: {
						email: body.email,
						password: body.password,
						name: body.name,
					},
				});
				userId = signUp.user.id;
			} catch (err) {
				// Roll the claim back so the invitation becomes redeemable again.
				await db
					.update(invitations)
					.set({ consumedAt: null })
					.where(eq(invitations.token, params.token));
				const e = err as {
					status?: number | string;
					statusCode?: number;
					body?: { message?: string; code?: string };
					message?: string;
				};
				const code = e?.body?.code;
				const message = e?.body?.message ?? e?.message ?? "signup failed";
				if (code === "USER_ALREADY_EXISTS") {
					set.status = 409;
					return { error: "email already registered", code };
				}
				const statusMap: Record<string, number> = {
					BAD_REQUEST: 400,
					UNAUTHORIZED: 401,
					FORBIDDEN: 403,
					NOT_FOUND: 404,
					CONFLICT: 409,
					UNPROCESSABLE_ENTITY: 422,
				};
				const status =
					typeof e?.statusCode === "number"
						? e.statusCode
						: typeof e?.status === "number"
							? e.status
							: typeof e?.status === "string"
								? (statusMap[e.status] ?? 400)
								: 400;
				set.status = status;
				return { error: message, code };
			}

			// Stamp consumedByUserId now that we have a user id, and wire up the
			// membership + master profile. These run best-effort after the user
			// exists; a failure here leaves a usable account that simply needs the
			// operator to insert the membership manually.
			await db
				.update(invitations)
				.set({ consumedByUserId: userId })
				.where(eq(invitations.token, params.token));

			await db
				.insert(tenantMemberships)
				.values({ userId, tenantId: invite.tenantId, role: invite.role })
				.onConflictDoNothing();

			if (invite.role === "MASTER") {
				const [t] = await db
					.select({ schemaName: tenants.schemaName })
					.from(tenants)
					.where(eq(tenants.id, invite.tenantId))
					.limit(1);
				if (t) {
					await withTenant(db, t.schemaName, async (tx) => {
						await tx
							.insert(masterProfiles)
							.values({
								userId,
								displayName: body.displayName ?? body.name,
								phone: body.phone ?? null,
								specializations: body.specializations ?? [],
							})
							.onConflictDoNothing();
					});
				}
			}

			return { ok: true, userId, tenantId: invite.tenantId, role: invite.role };
		},
		{ body: zodBody(RedeemInvitationInput) },
	);

export const invitationsRoutes = new Elysia().use(ownerInvitations).use(publicInvitations);
