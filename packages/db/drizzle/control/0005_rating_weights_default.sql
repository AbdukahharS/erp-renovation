ALTER TABLE "tenant_config" ALTER COLUMN "rating_weights" SET DEFAULT '{"speed":1.0,"defect":1.0}'::jsonb;--> statement-breakpoint
-- Backfill: tenants still on the old 0.5/0.5 default get the new 1.0/1.0.
-- Tenants who deliberately customized their weights are left untouched.
UPDATE "tenant_config" SET "rating_weights" = '{"speed":1.0,"defect":1.0}'::jsonb WHERE "rating_weights" = '{"speed":0.5,"defect":0.5}'::jsonb;
