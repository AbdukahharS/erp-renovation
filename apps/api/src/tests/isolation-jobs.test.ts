import { describe, expect, it } from "bun:test";
import { withTenant } from "@repo/db/with-tenant";
import {
	NotificationDispatchJobData,
	PushDeliveryJobData,
	StagePropagateJobData,
	WageCreditJobData,
} from "@repo/queue";
import { sql as dsql } from "drizzle-orm";
import { db } from "../db.ts";

/**
 * Phase 9 isolation: job-data shape and worker-side guards. Workers are a
 * separate app (apps/worker), so we don't import handlers directly here.
 * Instead we lock in the two structural invariants that prevent cross-tenant
 * leakage through the queue:
 *
 *   1. Every queue's data schema requires `tenantSchema`. A producer that
 *      forgets it fails Zod parsing in the worker before any DB write.
 *   2. `withTenant` rejects any schema name that isn't a strict
 *      `[a-zA-Z0-9_]+` identifier — closes the SQL-injection door even if a
 *      bug in a producer somehow set tenantSchema to attacker-controlled text.
 */

describe("isolation: queue job data carries tenant context", () => {
	it("wage-credit requires tenantSchema", () => {
		expect(() => WageCreditJobData.parse({ subStageInstanceId: crypto.randomUUID() })).toThrow();
		expect(() =>
			WageCreditJobData.parse({
				tenantSchema: "tenant_abc",
				subStageInstanceId: crypto.randomUUID(),
			}),
		).not.toThrow();
	});

	it("stage-propagate requires tenantSchema", () => {
		expect(() =>
			StagePropagateJobData.parse({
				subStageInstanceId: crypto.randomUUID(),
				propertyId: crypto.randomUUID(),
			}),
		).toThrow();
	});

	it("notification-dispatch requires tenantSchema", () => {
		expect(() =>
			NotificationDispatchJobData.parse({ notificationIntentId: crypto.randomUUID() }),
		).toThrow();
	});

	it("push-delivery requires tenantSchema", () => {
		expect(() =>
			PushDeliveryJobData.parse({
				notificationId: crypto.randomUUID(),
				subscriptionId: crypto.randomUUID(),
			}),
		).toThrow();
	});
});

describe("isolation: withTenant guards schema name", () => {
	it("rejects schema with semicolons / quotes / spaces", async () => {
		await expect(
			withTenant(db, 'tenant_a"; DROP SCHEMA public; --', async () => 1),
		).rejects.toThrow(/unsafe schema/);
		await expect(withTenant(db, "tenant a", async () => 1)).rejects.toThrow(/unsafe schema/);
		await expect(withTenant(db, "tenant-a", async () => 1)).rejects.toThrow(/unsafe schema/);
	});

	it("accepts a safe schema identifier", async () => {
		const result = await withTenant(db, "public", async (tx) => {
			const rows = await tx.execute<{ ok: number }>(dsql`SELECT 1 AS ok`);
			return rows[0]?.ok ?? 0;
		});
		expect(result).toBe(1);
	});
});
