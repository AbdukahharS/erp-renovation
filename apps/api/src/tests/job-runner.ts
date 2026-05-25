import { acceptanceEvents } from "@repo/acceptance/events";
import { processStagePropagate } from "../../../worker/src/jobs/stage-propagate.ts";
import { processWageCredit } from "../../../worker/src/jobs/wage-credit.ts";

/**
 * Test-only in-process job runner. Subscribes to the same acceptanceEvents
 * seam that production wires to BullMQ and executes the worker handlers
 * synchronously in this process — no Redis required.
 *
 * Tests that drive an Accept call must `await flushAcceptanceJobs()` before
 * asserting on downstream state (next-stage unlock, financial transactions,
 * notification intents) because EventEmitter callbacks don't block the route.
 */
const pending: Promise<unknown>[] = [];
let wired = false;

export function wireTestJobRunner(): void {
	if (wired) return;
	wired = true;
	acceptanceEvents.on("ACCEPTED", (event) => {
		if (!event.subStageInstanceId || !event.propertyId) return;
		const p = (async () => {
			// Order doesn't matter (the spec calls these "independent jobs"); we
			// run them in parallel to surface ordering bugs.
			await Promise.all([
				processWageCredit({
					data: {
						tenantSchema: event.tenantSchema,
						subStageInstanceId: event.subStageInstanceId as string,
					},
				}),
				processStagePropagate({
					data: {
						tenantSchema: event.tenantSchema,
						subStageInstanceId: event.subStageInstanceId as string,
						propertyId: event.propertyId as string,
						actorUserId: event.actorUserId ?? null,
					},
				}),
			]);
		})();
		pending.push(p.catch((err) => console.error("[test-job-runner] handler error:", err)));
	});
}

export async function flushAcceptanceJobs(): Promise<void> {
	while (pending.length > 0) {
		const batch = pending.splice(0);
		await Promise.all(batch);
	}
}
