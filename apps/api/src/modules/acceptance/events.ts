import { EventEmitter } from "node:events";
import type { StageEventType } from "@repo/db/schema/tenant";

/**
 * Phase 4 in-process domain event seam. Phase 5 will subscribe a BullMQ enqueuer
 * here (and/or poll the `stage_events` outbox written in the same transaction).
 *
 * Subscribers should be fast and non-throwing; the emit is fire-and-forget.
 */
export type AcceptanceEvent = {
	type: StageEventType;
	tenantSchema: string;
	subStageInstanceId?: string | null;
	propertyId?: string | null;
	actorUserId?: string | null;
	payload?: unknown;
	occurredAt: Date;
};

class TypedEmitter extends EventEmitter {
	emitEvent(event: AcceptanceEvent) {
		this.emit("stage", event);
		this.emit(event.type, event);
	}
	onEvent(listener: (event: AcceptanceEvent) => void) {
		this.on("stage", listener);
		return () => this.off("stage", listener);
	}
}

export const acceptanceEvents = new TypedEmitter();
