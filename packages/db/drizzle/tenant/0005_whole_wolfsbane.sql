ALTER TABLE "sub_stage_instances" ADD COLUMN "manual_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_stage_instances" ADD COLUMN "manual_blocked_by" text;--> statement-breakpoint
ALTER TABLE "sub_stage_instances" ADD COLUMN "manual_blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "sub_stage_instances" ADD COLUMN "manual_blocked_reason" text;