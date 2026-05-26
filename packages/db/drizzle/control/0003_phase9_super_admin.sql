ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
