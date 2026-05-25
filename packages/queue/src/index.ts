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
