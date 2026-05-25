import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	_resetForTests,
	attachSocket,
	detachSocket,
	localBroadcastToTenant,
	type TenantSocket,
} from "../modules/realtime/broadcast.ts";

// Avoid touching Redis from this unit test — the broadcast module's pattern
// subscription is only meaningful in a cross-process setup.
const savedRedisUrl = process.env.REDIS_URL;
beforeAll(() => {
	delete process.env.REDIS_URL;
	_resetForTests();
});
afterAll(() => {
	_resetForTests();
	if (savedRedisUrl !== undefined) process.env.REDIS_URL = savedRedisUrl;
});

/**
 * Phase 8 realtime tenant isolation. The broadcast map is keyed by tenant
 * schema; an event published for tenant A must never reach a socket attached
 * to tenant B. This is the socket-layer extension of the Phase 1 isolation
 * guarantee.
 */
describe("realtime broadcast isolation", () => {
	it("delivers only to sockets of the matching tenant", () => {
		const a: string[] = [];
		const b: string[] = [];
		const sockA: TenantSocket = { send: (data) => a.push(data) };
		const sockB: TenantSocket = { send: (data) => b.push(data) };

		attachSocket("tenant_a_schema", sockA);
		attachSocket("tenant_b_schema", sockB);
		try {
			localBroadcastToTenant("tenant_a_schema", { kind: "STAGE_ACCEPTED", x: 1 });
			expect(a.length).toBe(1);
			expect(b.length).toBe(0);

			localBroadcastToTenant("tenant_b_schema", { kind: "FINANCE_CHANGED", y: 2 });
			expect(a.length).toBe(1);
			expect(b.length).toBe(1);

			// Unknown schema is a no-op.
			localBroadcastToTenant("tenant_c_schema", { kind: "x" });
			expect(a.length).toBe(1);
			expect(b.length).toBe(1);
		} finally {
			detachSocket("tenant_a_schema", sockA);
			detachSocket("tenant_b_schema", sockB);
		}
	});

	it("detach removes the socket so further events don't fire", () => {
		const seen: string[] = [];
		const sock: TenantSocket = { send: (data) => seen.push(data) };
		attachSocket("tenant_x", sock);
		detachSocket("tenant_x", sock);
		localBroadcastToTenant("tenant_x", { kind: "STAGE_ACCEPTED" });
		expect(seen.length).toBe(0);
	});
});
