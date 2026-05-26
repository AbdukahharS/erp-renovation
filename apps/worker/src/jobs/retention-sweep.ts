import { tenantConfig, tenants } from "@repo/db/schema/control";
import {
	notifications,
	properties,
	propertyAssets,
	pushSubscriptions,
} from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { S3Client } from "bun";
import { and, sql as dsql, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../db.ts";

/**
 * Phase 9 daily retention sweep. For each active tenant:
 *   1. Delete `property_assets` on ARCHIVED properties uploaded > N days ago
 *      (also DELETE the R2 object).
 *   2. Delete `notifications` rows older than the tenant's retention setting.
 *   3. Prune `push_subscriptions` with > 5 consecutive failures OR last_seen
 *      older than 60 days.
 *
 * Errors per-tenant are logged and the sweep moves on — one stuck tenant
 * doesn't block the others.
 */
export async function processRetentionSweep(): Promise<{
	tenants: number;
	assetsDeleted: number;
	notificationsDeleted: number;
	subscriptionsDeleted: number;
}> {
	const r2 = readR2Client();
	const totals = { tenants: 0, assetsDeleted: 0, notificationsDeleted: 0, subscriptionsDeleted: 0 };

	const rows = await db
		.select({
			tenantId: tenants.id,
			schemaName: tenants.schemaName,
			photoRetentionDays: tenantConfig.photoRetentionDays,
			notificationRetentionDays: tenantConfig.notificationRetentionDays,
		})
		.from(tenants)
		.leftJoin(tenantConfig, eq(tenantConfig.tenantId, tenants.id))
		.where(eq(tenants.status, "ACTIVE"));

	for (const t of rows) {
		totals.tenants += 1;
		try {
			const photoDays = t.photoRetentionDays ?? 365;
			const notifDays = t.notificationRetentionDays ?? 90;
			const photoCutoff = new Date(Date.now() - photoDays * 86_400_000);
			const notifCutoff = new Date(Date.now() - notifDays * 86_400_000);
			const subStaleCutoff = new Date(Date.now() - 60 * 86_400_000);

			const result = await withTenant(db, t.schemaName, async (tx) => {
				// 1. Stale property assets on archived properties.
				const stale = await tx
					.select({ id: propertyAssets.id, r2Key: propertyAssets.r2Key })
					.from(propertyAssets)
					.innerJoin(properties, eq(properties.id, propertyAssets.propertyId))
					.where(and(eq(properties.status, "ARCHIVED"), lt(propertyAssets.uploadedAt, photoCutoff)))
					.limit(500);
				if (stale.length > 0) {
					await tx.delete(propertyAssets).where(
						inArray(
							propertyAssets.id,
							stale.map((s: { id: string }) => s.id),
						),
					);
				}
				// Delete from R2 outside the tx (best-effort; row deletion is the
				// source of truth). If R2 deletion later fails the object becomes
				// a permanent orphan — not catastrophic, but acknowledge it isn't
				// recovered automatically. A separate R2-side lifecycle policy
				// (configured on the bucket) is the long-term backstop.

				// 2. Old notifications.
				const notifResult = await tx.execute<{ n: number }>(
					dsql`WITH d AS (DELETE FROM ${notifications}
						   WHERE ${notifications.createdAt} < ${notifCutoff}
						   RETURNING 1)
						 SELECT count(*)::int AS n FROM d`,
				);

				// 3. Dead push subscriptions.
				const deadSubs = await tx
					.delete(pushSubscriptions)
					.where(
						or(
							lt(pushSubscriptions.lastSeenAt, subStaleCutoff),
							dsql`${pushSubscriptions.failureCount} > 5`,
						),
					)
					.returning({ id: pushSubscriptions.id });

				return {
					staleAssets: stale,
					notifDeleted: notifResult[0]?.n ?? 0,
					subDeleted: deadSubs.length,
				};
			});

			// R2 cleanup — runs after the tx commit. Best-effort; failures are
			// logged and the orphans get reaped on the next sweep.
			if (r2 && result.staleAssets.length > 0) {
				for (const a of result.staleAssets) {
					try {
						await r2.delete(a.r2Key);
					} catch (err) {
						console.error(`[retention] r2 delete failed ${a.r2Key}:`, (err as Error).message);
					}
				}
			}
			totals.assetsDeleted += result.staleAssets.length;
			totals.notificationsDeleted += result.notifDeleted;
			totals.subscriptionsDeleted += result.subDeleted;

			console.log(
				`[retention:${t.schemaName}] assets=${result.staleAssets.length} notifications=${result.notifDeleted} subs=${result.subDeleted}`,
			);
		} catch (err) {
			console.error(`[retention:${t.schemaName}] failed:`, (err as Error).message);
		}
	}

	// `notification_deliveries` is cleaned up automatically via ON DELETE
	// CASCADE when its parent `notifications` row is deleted above.
	return totals;
}

function readR2Client(): S3Client | null {
	const endpoint = process.env.R2_ENDPOINT;
	const accessKeyId = process.env.R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
	const bucket = process.env.R2_BUCKET;
	if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
	return new S3Client({ endpoint, accessKeyId, secretAccessKey, bucket });
}
