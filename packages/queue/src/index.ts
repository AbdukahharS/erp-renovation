import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

/**
 * Phase 5 queue plumbing. Owns queue names, job-data schemas, and the IORedis
 * connection factory. Both `apps/api` (producer) and `apps/worker` (consumer)
 * depend on this package so the wire shapes can't drift.
 *
 * IORedis is mandatory — BullMQ's maintainer-endorsed Bun config (per the
 * project's CLAUDE.md and the BullMQ benchmark). Do NOT swap in `Bun.redis`.
 */

export const QUEUE_NAMES = {
	WAGE_CREDIT: "wage-credit",
	STAGE_PROPAGATE: "stage-propagate",
	NOTIFICATION_DISPATCH: "notification-dispatch",
	PUSH_DELIVERY: "push-delivery",
	// Phase 9: daily retention sweep. Iterates tenants and prunes old photos,
	// notifications, and dead push subscriptions per tenant_config retention
	// values.
	RETENTION_SWEEP: "retention-sweep",
} as const;

export const WageCreditJobData = z.object({
	tenantSchema: z.string(),
	subStageInstanceId: z.string().uuid(),
	stageEventId: z.string().uuid().optional(),
});
export type WageCreditJobData = z.infer<typeof WageCreditJobData>;

export const StagePropagateJobData = z.object({
	tenantSchema: z.string(),
	subStageInstanceId: z.string().uuid(),
	propertyId: z.string().uuid(),
	actorUserId: z.string().nullable().optional(),
	stageEventId: z.string().uuid().optional(),
});
export type StagePropagateJobData = z.infer<typeof StagePropagateJobData>;

export const NotificationDispatchJobData = z.object({
	tenantSchema: z.string(),
	notificationIntentId: z.string().uuid(),
});
export type NotificationDispatchJobData = z.infer<typeof NotificationDispatchJobData>;

export const PushDeliveryJobData = z.object({
	tenantSchema: z.string(),
	notificationId: z.string().uuid(),
	subscriptionId: z.string().uuid(),
});
export type PushDeliveryJobData = z.infer<typeof PushDeliveryJobData>;

// Empty payload — the job enumerates every tenant on its own.
export const RetentionSweepJobData = z.object({});
export type RetentionSweepJobData = z.infer<typeof RetentionSweepJobData>;

let redisSingleton: Redis | null = null;

/**
 * Returns a process-wide IORedis client. BullMQ requires `maxRetriesPerRequest:
 * null` on the *connection it uses for blocking commands*, which is exactly
 * what queue/worker instances need.
 */
export function getRedisConnection(): Redis {
	if (redisSingleton) return redisSingleton;
	const url = process.env.REDIS_URL;
	if (!url) {
		throw new Error("REDIS_URL is not set");
	}
	redisSingleton = new Redis(url, {
		maxRetriesPerRequest: null,
		enableReadyCheck: false,
	});
	return redisSingleton;
}

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue {
	const existing = queues.get(name);
	if (existing) return existing;
	const q = new Queue(name, { connection: getRedisConnection() });
	queues.set(name, q);
	return q;
}

export function getWageCreditQueue(): Queue<WageCreditJobData> {
	return getQueue(QUEUE_NAMES.WAGE_CREDIT) as Queue<WageCreditJobData>;
}

export function getStagePropagateQueue(): Queue<StagePropagateJobData> {
	return getQueue(QUEUE_NAMES.STAGE_PROPAGATE) as Queue<StagePropagateJobData>;
}

export function getNotificationDispatchQueue(): Queue<NotificationDispatchJobData> {
	return getQueue(QUEUE_NAMES.NOTIFICATION_DISPATCH) as Queue<NotificationDispatchJobData>;
}

export function getPushDeliveryQueue(): Queue<PushDeliveryJobData> {
	return getQueue(QUEUE_NAMES.PUSH_DELIVERY) as Queue<PushDeliveryJobData>;
}

export function getRetentionSweepQueue(): Queue<RetentionSweepJobData> {
	return getQueue(QUEUE_NAMES.RETENTION_SWEEP) as Queue<RetentionSweepJobData>;
}

/**
 * Ensure a daily repeatable job is scheduled on the retention queue. Idempotent
 * — BullMQ deduplicates by `jobId` + `repeat.pattern`.
 */
export async function scheduleDailyRetentionSweep(): Promise<void> {
	const q = getRetentionSweepQueue();
	await q.add(
		"daily",
		{},
		{
			// 03:00 UTC every day
			repeat: { pattern: "0 3 * * *" },
			jobId: "retention-sweep-daily",
			removeOnComplete: { age: 7 * 24 * 60 * 60 },
			removeOnFail: { age: 30 * 24 * 60 * 60 },
		},
	);
}

export async function closeAllQueues(): Promise<void> {
	await Promise.all([...queues.values()].map((q) => q.close()));
	queues.clear();
	if (redisSingleton) {
		await redisSingleton.quit();
		redisSingleton = null;
	}
}

export const DEFAULT_JOB_OPTS = {
	attempts: 5,
	backoff: { type: "exponential" as const, delay: 1_000 },
	removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
	removeOnFail: { age: 7 * 24 * 60 * 60 },
};

// ---------- Phase 8 realtime pub/sub ----------
//
// Worker processes broadcast realtime events via Redis pub/sub; API instances
// subscribe and fan out to their local WebSocket clients. Channel name embeds
// tenant schema so cross-tenant leakage is structurally impossible.

export const REALTIME_CHANNEL_PREFIX = "tenant-realtime:";

export function realtimeChannel(tenantSchema: string): string {
	return `${REALTIME_CHANNEL_PREFIX}${tenantSchema}`;
}

export function publishToTenant(tenantSchema: string, event: unknown): void {
	if (!process.env.REDIS_URL) return; // no-op in tests without Redis
	const r = getRedisConnection();
	// Fire-and-forget; Redis PUBLISH is fast and any failure here is non-fatal
	// to the originating tx (in-app + push delivery are the durable channels).
	r.publish(realtimeChannel(tenantSchema), JSON.stringify(event)).catch((err) => {
		console.error("[realtime:publish] failed:", err);
	});
}
