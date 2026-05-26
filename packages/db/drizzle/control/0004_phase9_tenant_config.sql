CREATE TABLE IF NOT EXISTS "tenant_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"target_unit_cost" numeric(14, 2),
	"rating_weights" jsonb DEFAULT '{"speed":0.5,"defect":0.5}'::jsonb NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_retention_days" integer DEFAULT 365 NOT NULL,
	"notification_retention_days" integer DEFAULT 90 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "tenant_config" ADD CONSTRAINT "tenant_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: ensure every existing tenant gets a default config row.
INSERT INTO "tenant_config" ("tenant_id") SELECT "id" FROM "tenants" WHERE "id" NOT IN (SELECT "tenant_id" FROM "tenant_config");
