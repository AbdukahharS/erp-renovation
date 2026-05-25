import { acceptanceEvents } from "@repo/acceptance/events";
import { stageEvents } from "@repo/db/schema/tenant";
import { withTenant } from "@repo/db/with-tenant";
import { DEFAULT_JOB_OPTS, getStagePropagateQueue, getWageCreditQueue } from "@repo/queue";
import { eq } from "drizzle-orm";
import { db } from "../../db.ts";

/**
 * Phase 5 enqueuer. Subscribes once to the in-process acceptance event seam
 * and pushes a BullMQ job onto each downstream queue when a stage is ACCEPTED.
 *
 * Both jobs are keyed on `subStageInstanceId` (`jobId` deduplication) so a
 * double-accept / retry collapses to one job at queue level. DB-level unique
 * constraints in `financial_transactions` and `notification_intents` provide
 * the second line of defense if BullMQ ever drops a dedupe.
 *
 * The two jobs are intentionally INDEPENDENT (per Phase 5 §5.2): a transient
 * finance failure must not hold up the next-stage unlock, and vice versa.
 *
 * If REDIS_URL is unset (test environments without Redis), enqueuing silently
 * no-ops so the test suite can drive handlers directly.
 */
let wired = false;
export function wireAcceptanceEnqueuer(): void {
	if (wired) return;
	wired = true;
	if (!process.env.REDIS_URL) {
		console.warn(
			"[acceptance:enqueue] REDIS_URL is not set — acceptance jobs will NOT be enqueued. " +
				"Set REDIS_URL in production or accept-side-effects (wage credit, unlock, notify) will be silently dropped.",
		);
	}
	acceptanceEvents.on("ACCEPTED", (event) => {
		void enqueueForAcceptedEvent(event).catch((err) => {
			console.error("[acceptance:enqueue] failed to enqueue jobs:", err);
		});
	});
}

async function enqueueForAcceptedEvent(event: {
	tenantSchema: string;
	stageEventId?: string;
	subStageInstanceId?: string | null;
	propertyId?: string | null;
	actorUserId?: string | null;
}): Promise<void> {
	if (!event.subStageInstanceId || !event.propertyId) return;
	if (!process.env.REDIS_URL) return;

	const dedupeKey = event.subStageInstanceId;
	await Promise.all([
		getWageCreditQueue().add(
			"wage-credit",
			{
				tenantSchema: event.tenantSchema,
				subStageInstanceId: event.subStageInstanceId,
				stageEventId: event.stageEventId,
			},
			{ ...DEFAULT_JOB_OPTS, jobId: `wage-${dedupeKey}` },
		),
		getStagePropagateQueue().add(
			"stage-propagate",
			{
				tenantSchema: event.tenantSchema,
				subStageInstanceId: event.subStageInstanceId,
				propertyId: event.propertyId,
				actorUserId: event.actorUserId ?? null,
				stageEventId: event.stageEventId,
			},
			{ ...DEFAULT_JOB_OPTS, jobId: `propagate-${dedupeKey}` },
		),
	]);

	// Mark the outbox row processed so the worker's outbox poller doesn't
	// re-enqueue what we already handled. Best-effort; on failure the poller
	// will (idempotently) re-enqueue and the DB unique constraints absorb it.
	if (event.stageEventId) {
		try {
			await withTenant(db, event.tenantSchema, async (tx) => {
				await tx
					.update(stageEvents)
					.set({ processedAt: new Date() })
					.where(eq(stageEvents.id, event.stageEventId as string));
			});
		} catch (err) {
			console.error("[acceptance:enqueue] failed to mark stage_event processed:", err);
		}
	}
}
