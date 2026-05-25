import { tenants } from "@repo/db/schema/control";
import { stageEvents, stageInstances, subStageInstances } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { DEFAULT_JOB_OPTS, getStagePropagateQueue, getWageCreditQueue } from "@repo/queue";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db.ts";

/**
 * Phase 5 durability fallback. The in-process enqueuer in `apps/api` fires
 * post-commit via `deferUntilCommit`, but if the API process crashes between
 * tx commit and `queue.add()` the ACCEPTED event would be stranded in
 * `stage_events` with no job ever running. This poller scans every active
 * tenant's `stage_events` outbox for ACCEPTED rows with `processed_at IS NULL`,
 * (re-)enqueues the standard job pair, and marks them processed.
 *
 * Idempotency is preserved by BullMQ `jobId` dedupe and the DB unique
 * constraints on `financial_transactions` and `notification_intents`; a row
 * that was already processed by the in-process listener will be a no-op when
 * the poller picks it up.
 */

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 30_000);
const POLL_BATCH_SIZE = Number(process.env.OUTBOX_POLL_BATCH_SIZE ?? 50);

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

export function startOutboxPoller(): void {
	stopped = false;
	scheduleNext(0);
	console.log(`[outbox-poller] started; interval=${POLL_INTERVAL_MS}ms batch=${POLL_BATCH_SIZE}`);
}

export async function stopOutboxPoller(): Promise<void> {
	stopped = true;
	if (timer) clearTimeout(timer);
	timer = null;
}

function scheduleNext(delay: number): void {
	if (stopped) return;
	timer = setTimeout(() => {
		void runOnce()
			.catch((err) => console.error("[outbox-poller] tick failed:", err))
			.finally(() => scheduleNext(POLL_INTERVAL_MS));
	}, delay);
}

export async function runOnce(): Promise<{ scanned: number; enqueued: number }> {
	const activeTenants = await db
		.select({ schemaName: tenants.schemaName })
		.from(tenants)
		.where(eq(tenants.status, "ACTIVE"));

	let scanned = 0;
	let enqueued = 0;
	for (const t of activeTenants) {
		const r = await processTenant(t.schemaName);
		scanned += r.scanned;
		enqueued += r.enqueued;
	}
	return { scanned, enqueued };
}

async function processTenant(schemaName: string): Promise<{ scanned: number; enqueued: number }> {
	return await withTenant(db, schemaName, async (tx) => {
		const rows = await tx
			.select({
				id: stageEvents.id,
				subStageInstanceId: stageEvents.subStageInstanceId,
				propertyId: stageEvents.propertyId,
				actorUserId: stageEvents.actorUserId,
			})
			.from(stageEvents)
			.where(and(eq(stageEvents.eventType, "ACCEPTED"), isNull(stageEvents.processedAt)))
			.limit(POLL_BATCH_SIZE);

		if (rows.length === 0) return { scanned: 0, enqueued: 0 };

		let enqueued = 0;
		for (const row of rows) {
			if (!row.subStageInstanceId) {
				await tx
					.update(stageEvents)
					.set({ processedAt: new Date() })
					.where(eq(stageEvents.id, row.id));
				continue;
			}

			// Re-derive propertyId if the event row didn't carry one (defensive).
			let propertyId = row.propertyId;
			if (!propertyId) {
				const [join] = await tx
					.select({ propertyId: stageInstances.propertyId })
					.from(subStageInstances)
					.innerJoin(stageInstances, eq(stageInstances.id, subStageInstances.stageInstanceId))
					.where(eq(subStageInstances.id, row.subStageInstanceId))
					.limit(1);
				propertyId = join?.propertyId ?? null;
			}
			if (!propertyId) {
				await tx
					.update(stageEvents)
					.set({ processedAt: new Date() })
					.where(eq(stageEvents.id, row.id));
				continue;
			}

			const dedupeKey = row.subStageInstanceId;
			await Promise.all([
				getWageCreditQueue().add(
					"wage-credit",
					{
						tenantSchema: schemaName,
						subStageInstanceId: row.subStageInstanceId,
						stageEventId: row.id,
					},
					{ ...DEFAULT_JOB_OPTS, jobId: `wage-${dedupeKey}` },
				),
				getStagePropagateQueue().add(
					"stage-propagate",
					{
						tenantSchema: schemaName,
						subStageInstanceId: row.subStageInstanceId,
						propertyId,
						actorUserId: row.actorUserId ?? null,
						stageEventId: row.id,
					},
					{ ...DEFAULT_JOB_OPTS, jobId: `propagate-${dedupeKey}` },
				),
			]);
			await tx
				.update(stageEvents)
				.set({ processedAt: new Date() })
				.where(eq(stageEvents.id, row.id));
			enqueued++;
		}
		return { scanned: rows.length, enqueued };
	});
}
