CREATE TABLE "master_ratings" (
	"master_user_id" text PRIMARY KEY NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"avg_duration_ratio" numeric(6, 3),
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "master_profiles" ADD COLUMN "availability_override" text;--> statement-breakpoint
ALTER TABLE "master_profiles" ADD COLUMN "availability_override_until" timestamp;