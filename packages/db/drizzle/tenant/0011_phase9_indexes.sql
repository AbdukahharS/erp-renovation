-- Phase 9 hot-path indexes. Each one is chosen against a known query:
--   * sub_stage_instances (property_id, status): owner board + acceptance queue.
--     sub_stage_instances_status_idx already exists; add the composite.
-- (sub_stage_instances_stage_idx via stage_instance_id remains the join path
--  to stages; we don't need a property_id index alone because property_id
--  isn't on sub_stage_instances — it lives on stage_instances.)
CREATE INDEX IF NOT EXISTS "sub_stage_instances_stage_status_idx"
	ON "sub_stage_instances" ("stage_instance_id", "status");--> statement-breakpoint

-- Inspector queue: open requests sorted by submission time.
CREATE INDEX IF NOT EXISTS "acceptance_requests_open_submitted_idx"
	ON "acceptance_requests" ("submitted_at")
	WHERE "resolved_at" IS NULL;--> statement-breakpoint

-- Master balance ledger query.
CREATE INDEX IF NOT EXISTS "financial_transactions_master_created_idx"
	ON "financial_transactions" ("master_user_id", "created_at" DESC);--> statement-breakpoint

-- Per-property finance summary aggregation.
CREATE INDEX IF NOT EXISTS "financial_transactions_property_type_idx"
	ON "financial_transactions" ("property_id", "type");--> statement-breakpoint

-- Push retry sweep: scan pending/failed deliveries by status.
CREATE INDEX IF NOT EXISTS "notification_deliveries_sub_status_idx"
	ON "notification_deliveries" ("subscription_id", "status");--> statement-breakpoint

-- Stage audit timeline: most recent events per property.
CREATE INDEX IF NOT EXISTS "stage_events_property_recent_idx"
	ON "stage_events" ("property_id", "occurred_at" DESC);--> statement-breakpoint

-- Retention sweep: notifications older than N days, oldest first.
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx"
	ON "notifications" ("created_at");--> statement-breakpoint

-- Retention sweep: property_assets uploaded older than N days.
CREATE INDEX IF NOT EXISTS "property_assets_uploaded_at_idx"
	ON "property_assets" ("uploaded_at");
