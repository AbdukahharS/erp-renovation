import { notifications, pushSubscriptions } from "@repo/db/schema/tenant";
import { publishToTenant } from "@repo/queue";
import {
	MarkReadInputSchema,
	PushSubscriptionInputSchema,
	UpdateSubscriptionLocaleInputSchema,
} from "@repo/validators";
import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { zodBody } from "../../lib/zod-body.ts";
import { tenancy } from "../tenancy/plugin.ts";

/**
 * Phase 8 notifications API. All routes are tenant-scoped via `tenancy` and
 * operate on the calling user's own rows. There is no cross-user access path —
 * a list query is hard-filtered to `recipientUserId = current user`, and
 * subscriptions are upserted under the caller's userId regardless of body
 * content. This is the structural guarantee that keeps cross-tenant /
 * cross-user leakage impossible (extends the Phase 1 isolation invariant to
 * the new tables).
 */
export const notificationsRoutes = new Elysia({ prefix: "/tenant/notifications" })
	.use(tenancy)

	.get("/vapid-public-key", () => {
		return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
	})

	.get(
		"/",
		async ({ user, runInTenant, query, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			const limit = Math.min(Math.max(Number(query.limit ?? 30), 1), 100);
			const unreadOnly = query.unreadOnly === "true" || query.unreadOnly === "1";
			const cursor = typeof query.cursor === "string" ? new Date(query.cursor) : null;

			return await runInTenant(async (tx) => {
				const conditions = [eq(notifications.recipientUserId, user.id)];
				if (unreadOnly) conditions.push(isNull(notifications.readAt));
				if (cursor && !Number.isNaN(cursor.getTime())) {
					conditions.push(lt(notifications.createdAt, cursor));
				}
				const rows = await tx
					.select({
						id: notifications.id,
						type: notifications.type,
						title: notifications.title,
						body: notifications.body,
						targetUrl: notifications.targetUrl,
						propertyId: notifications.propertyId,
						subStageInstanceId: notifications.subStageInstanceId,
						localizationParams: notifications.localizationParams,
						readAt: notifications.readAt,
						createdAt: notifications.createdAt,
					})
					.from(notifications)
					.where(and(...conditions))
					.orderBy(desc(notifications.createdAt))
					.limit(limit + 1);

				const hasMore = rows.length > limit;
				const items = hasMore ? rows.slice(0, limit) : rows;
				return {
					items: items.map((r) => ({
						...r,
						readAt: r.readAt ? r.readAt.toISOString() : null,
						createdAt: r.createdAt.toISOString(),
					})),
					nextCursor: hasMore ? (items[items.length - 1]?.createdAt.toISOString() ?? null) : null,
				};
			});
		},
		{
			query: t.Object({
				limit: t.Optional(t.String()),
				cursor: t.Optional(t.String()),
				unreadOnly: t.Optional(t.String()),
			}),
		},
	)

	.get("/unread-count", async ({ user, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "unauthorized" };
		}
		return await runInTenant(async (tx) => {
			const [row] = await tx
				.select({ count: count() })
				.from(notifications)
				.where(and(eq(notifications.recipientUserId, user.id), isNull(notifications.readAt)));
			return { count: Number(row?.count ?? 0) };
		});
	})

	.post(
		"/mark-read",
		async ({ user, body, tenant, runInTenant, set }) => {
			if (!runInTenant || !user || !tenant) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			const result = await runInTenant(async (tx) => {
				const now = new Date();
				if (body.all) {
					const r = await tx
						.update(notifications)
						.set({ readAt: now })
						.where(and(eq(notifications.recipientUserId, user.id), isNull(notifications.readAt)))
						.returning({ id: notifications.id });
					return { updated: r.length };
				}
				if (!body.ids || body.ids.length === 0) return { updated: 0 };
				const r = await tx
					.update(notifications)
					.set({ readAt: now })
					.where(
						and(
							eq(notifications.recipientUserId, user.id),
							inArray(notifications.id, body.ids),
							isNull(notifications.readAt),
						),
					)
					.returning({ id: notifications.id });
				return { updated: r.length };
			});
			// Phase 8 audit #1: broadcast NOTIFICATION_READ so other devices for
			// the same user clear their unread badge without waiting on the 60s
			// refetchInterval. The realtime client filters on recipientUserId so
			// other users in the tenant ignore the event.
			if (result.updated > 0) {
				publishToTenant(tenant.schemaName, {
					kind: "NOTIFICATION_READ",
					recipientUserId: user.id,
				});
			}
			return result;
		},
		{ body: zodBody(MarkReadInputSchema) },
	)

	.post(
		"/subscriptions",
		async ({ user, body, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			return await runInTenant(async (tx) => {
				// Upsert by endpoint (globally unique on the push service). Always
				// bind to the calling user's id — body cannot specify a different
				// userId, which is the isolation guarantee for this route.
				const locale = body.locale ?? "en";
				const [row] = await tx
					.insert(pushSubscriptions)
					.values({
						userId: user.id,
						endpoint: body.endpoint,
						p256dh: body.keys.p256dh,
						auth: body.keys.auth,
						userAgent: body.userAgent ?? null,
						locale,
						failureCount: 0,
					})
					.onConflictDoUpdate({
						target: pushSubscriptions.endpoint,
						set: {
							userId: user.id,
							p256dh: body.keys.p256dh,
							auth: body.keys.auth,
							userAgent: body.userAgent ?? null,
							locale,
							failureCount: 0,
							lastSeenAt: new Date(),
						},
					})
					.returning({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint });
				return { id: row?.id, endpoint: row?.endpoint };
			});
		},
		{ body: zodBody(PushSubscriptionInputSchema) },
	)

	.patch(
		"/subscriptions/locale",
		async ({ user, body, runInTenant, set }) => {
			if (!runInTenant || !user) {
				set.status = 401;
				return { error: "unauthorized" };
			}
			return await runInTenant(async (tx) => {
				// Update only the row owned by the calling user with that endpoint.
				// Other devices' rows are untouched — they self-refresh via the
				// subscribe upsert on their next app load (apps/web/src/lib/push.ts
				// passes the current i18n.language at subscribe time).
				const result = await tx
					.update(pushSubscriptions)
					.set({ locale: body.locale, lastSeenAt: new Date() })
					.where(
						and(
							eq(pushSubscriptions.endpoint, body.endpoint),
							eq(pushSubscriptions.userId, user.id),
						),
					)
					.returning({ id: pushSubscriptions.id });
				if (result.length === 0) {
					set.status = 404;
					return { error: "not found" };
				}
				return { ok: true };
			});
		},
		{ body: zodBody(UpdateSubscriptionLocaleInputSchema) },
	)

	.delete("/subscriptions/:subscriptionId", async ({ user, params, runInTenant, set }) => {
		if (!runInTenant || !user) {
			set.status = 401;
			return { error: "unauthorized" };
		}
		return await runInTenant(async (tx) => {
			const result = await tx
				.delete(pushSubscriptions)
				.where(
					and(
						eq(pushSubscriptions.id, params.subscriptionId),
						eq(pushSubscriptions.userId, user.id),
					),
				)
				.returning({ id: pushSubscriptions.id });
			if (result.length === 0) {
				set.status = 404;
				return { error: "not found" };
			}
			return { ok: true };
		});
	});
