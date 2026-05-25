import {
	closeAllQueues,
	getRedisConnection,
	NotificationDispatchJobData,
	PushDeliveryJobData,
	QUEUE_NAMES,
	StagePropagateJobData,
	WageCreditJobData,
} from "@repo/queue";
import { Worker } from "bullmq";
import { processNotificationDispatch } from "./jobs/notification-dispatch.ts";
import { processPushDelivery } from "./jobs/push-delivery.ts";
import { processStagePropagate } from "./jobs/stage-propagate.ts";
import { processWageCredit } from "./jobs/wage-credit.ts";
import { startOutboxPoller, stopOutboxPoller } from "./outbox-poller.ts";

/**
 * Phase 5 + 8 worker entry. Boots one BullMQ Worker per queue, sharing a single
 * IORedis connection. Each handler is fully self-contained (creates its own
 * tenant transaction via `withTenant`).
 */

const connection = getRedisConnection();

const wageCreditWorker = new Worker(
	QUEUE_NAMES.WAGE_CREDIT,
	async (job) => {
		const data = WageCreditJobData.parse(job.data);
		await processWageCredit({ data });
	},
	{ connection, concurrency: 8 },
);

const stagePropagateWorker = new Worker(
	QUEUE_NAMES.STAGE_PROPAGATE,
	async (job) => {
		const data = StagePropagateJobData.parse(job.data);
		await processStagePropagate({ data });
	},
	{ connection, concurrency: 4 },
);

const notificationDispatchWorker = new Worker(
	QUEUE_NAMES.NOTIFICATION_DISPATCH,
	async (job) => {
		const data = NotificationDispatchJobData.parse(job.data);
		await processNotificationDispatch({ data });
	},
	{ connection, concurrency: 8 },
);

const pushDeliveryWorker = new Worker(
	QUEUE_NAMES.PUSH_DELIVERY,
	async (job) => {
		const data = PushDeliveryJobData.parse(job.data);
		await processPushDelivery({ data });
	},
	{ connection, concurrency: 8 },
);

const allWorkers = [
	wageCreditWorker,
	stagePropagateWorker,
	notificationDispatchWorker,
	pushDeliveryWorker,
];

for (const w of allWorkers) {
	w.on("completed", (job) => {
		console.log(`[worker:${w.name}] job ${job.id} completed`);
	});
	w.on("failed", (job, err) => {
		console.error(`[worker:${w.name}] job ${job?.id} failed:`, err.message);
	});
}

startOutboxPoller();

console.log(
	"[worker] ready: wage-credit + stage-propagate + notification-dispatch + push-delivery + outbox-poller",
);

let shuttingDown = false;
async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[worker] received ${signal}, draining...`);
	await stopOutboxPoller();
	await Promise.all(allWorkers.map((w) => w.close()));
	await closeAllQueues();
	process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
