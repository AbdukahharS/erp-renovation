import { tenants } from "@repo/db/schema/control";
import { properties, propertyShareLinks } from "@repo/db/schema/tenant";
import { CreatePropertyShareLinkInput, RotateShareLinkPasswordInput } from "@repo/validators";
import { and, asc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db.ts";
import { zodBody } from "../../lib/zod-body.ts";
import { requireRole } from "../auth/guards.ts";
import { tenancy } from "../tenancy/plugin.ts";

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomSlug(length = 12): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = "";
	for (let i = 0; i < length; i++) {
		out += SLUG_ALPHABET[(bytes[i] ?? 0) % SLUG_ALPHABET.length];
	}
	return out;
}

async function hashPassword(plain: string): Promise<string> {
	return await Bun.password.hash(plain, { algorithm: "argon2id" });
}

function publicLinkUrl(tenantSlug: string, linkSlug: string, request: Request): string {
	// Prefer the explicit PUBLIC_APP_URL (set in prod where API and web live on
	// different hosts). In dev we fall back to the request's Origin/Referer so
	// the link is copyable without extra config.
	const configured = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
	if (configured) return `${configured}/p/${tenantSlug}/${linkSlug}`;
	const origin = request.headers.get("origin") ?? "";
	if (origin) return `${origin.replace(/\/$/, "")}/p/${tenantSlug}/${linkSlug}`;
	const referer = request.headers.get("referer");
	if (referer) {
		try {
			const u = new URL(referer);
			return `${u.origin}/p/${tenantSlug}/${linkSlug}`;
		} catch {}
	}
	return `/p/${tenantSlug}/${linkSlug}`;
}

export const propertyShareLinksRoutes = new Elysia({ prefix: "" })
	.use(tenancy)
	.use(requireRole("OWNER"))

	.get(
		"/properties/:propertyId/share-links",
		async ({ params, request, tenant, runInTenant, set }) => {
			if (!runInTenant || !tenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const [tenantRow] = await db
				.select({ slug: tenants.slug })
				.from(tenants)
				.where(eq(tenants.id, tenant.id))
				.limit(1);
			if (!tenantRow) {
				set.status = 500;
				return { error: "tenant lookup failed" };
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
				const rows = await tx
					.select({
						id: propertyShareLinks.id,
						propertyId: propertyShareLinks.propertyId,
						slug: propertyShareLinks.slug,
						createdByUserId: propertyShareLinks.createdByUserId,
						revokedAt: propertyShareLinks.revokedAt,
						revokedBy: propertyShareLinks.revokedBy,
						createdAt: propertyShareLinks.createdAt,
						updatedAt: propertyShareLinks.updatedAt,
					})
					.from(propertyShareLinks)
					.where(eq(propertyShareLinks.propertyId, params.propertyId))
					.orderBy(asc(propertyShareLinks.createdAt));
				return rows.map((r) => ({ ...r, url: publicLinkUrl(tenantRow.slug, r.slug, request) }));
			});
		},
	)

	.post(
		"/properties/:propertyId/share-links",
		async ({ params, body, request, tenant, user, runInTenant, set }) => {
			if (!runInTenant || !tenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const [tenantRow] = await db
				.select({ slug: tenants.slug })
				.from(tenants)
				.where(eq(tenants.id, tenant.id))
				.limit(1);
			if (!tenantRow) {
				set.status = 500;
				return { error: "tenant lookup failed" };
			}

			const passwordHash = await hashPassword(body.password);

			const created = await runInTenant(async (tx) => {
				const [prop] = await tx
					.select({ id: properties.id })
					.from(properties)
					.where(eq(properties.id, params.propertyId))
					.limit(1);
				if (!prop) return { kind: "error" as const, status: 404, message: "property not found" };

				for (let attempt = 0; attempt < 5; attempt++) {
					const slug = randomSlug();
					try {
						const [row] = await tx
							.insert(propertyShareLinks)
							.values({
								propertyId: prop.id,
								slug,
								passwordHash,
								createdByUserId: user.id,
							})
							.returning({
								id: propertyShareLinks.id,
								slug: propertyShareLinks.slug,
								createdAt: propertyShareLinks.createdAt,
							});
						if (row) return { kind: "ok" as const, row };
					} catch {
						// retry on slug collision
					}
				}
				return { kind: "error" as const, status: 500, message: "could not allocate slug" };
			});

			if (created.kind === "error") {
				set.status = created.status;
				return { error: created.message };
			}

			return {
				id: created.row.id,
				slug: created.row.slug,
				url: publicLinkUrl(tenantRow.slug, created.row.slug, request),
				createdAt: created.row.createdAt,
			};
		},
		{ body: zodBody(CreatePropertyShareLinkInput) },
	)

	.post(
		"/properties/:propertyId/share-links/:linkId/rotate-password",
		async ({ params, body, runInTenant, set }) => {
			if (!runInTenant) {
				set.status = 401;
				return { error: "no tenant" };
			}
			const passwordHash = await hashPassword(body.password);
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(propertyShareLinks)
					.set({ passwordHash, updatedAt: new Date() })
					.where(
						and(
							eq(propertyShareLinks.id, params.linkId),
							eq(propertyShareLinks.propertyId, params.propertyId),
						),
					)
					.returning({ id: propertyShareLinks.id, updatedAt: propertyShareLinks.updatedAt });
				if (!row) {
					set.status = 404;
					return { error: "share link not found" };
				}
				return { id: row.id, updatedAt: row.updatedAt };
			});
		},
		{ body: zodBody(RotateShareLinkPasswordInput) },
	)

	.post(
		"/properties/:propertyId/share-links/:linkId/revoke",
		async ({ params, user, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "no tenant" };
			}
			return await runInTenant(async (tx) => {
				const [row] = await tx
					.update(propertyShareLinks)
					.set({ revokedAt: new Date(), revokedBy: user.id, updatedAt: new Date() })
					.where(
						and(
							eq(propertyShareLinks.id, params.linkId),
							eq(propertyShareLinks.propertyId, params.propertyId),
						),
					)
					.returning({ id: propertyShareLinks.id, revokedAt: propertyShareLinks.revokedAt });
				if (!row) {
					set.status = 404;
					return { error: "share link not found" };
				}
				return row;
			});
		},
	);
