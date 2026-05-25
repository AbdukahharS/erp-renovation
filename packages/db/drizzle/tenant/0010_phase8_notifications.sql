ALTER TYPE "notification_intent_type" ADD VALUE IF NOT EXISTS 'STAGE_SUBMITTED';--> statement-breakpoint
ALTER TYPE "notification_intent_type" ADD VALUE IF NOT EXISTS 'STAGE_REJECTED';--> statement-breakpoint
ALTER TYPE "notification_intent_type" ADD VALUE IF NOT EXISTS 'STAGE_BLOCKED';--> statement-breakpoint
ALTER TYPE "notification_intent_type" ADD VALUE IF NOT EXISTS 'STAGE_UNBLOCKED';--> statement-breakpoint
CREATE TYPE "notification_delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'GONE');--> statement-breakpoint
ALTER TABLE "notification_intents" ADD COLUMN "notification_id" uuid;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" text NOT NULL,
	"type" "notification_intent_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"target_url" text,
	"property_id" uuid,
	"sub_stage_instance_id" uuid,
	"intent_id" uuid,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL,
	CONSTRAINT "notifications_sub_stage_instance_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE SET NULL
);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_intent_unique" UNIQUE("intent_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_user_id", "created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_user_id", "created_at") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_notif_sub_unique" UNIQUE("notification_id", "subscription_id"),
	CONSTRAINT "notification_deliveries_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE,
	CONSTRAINT "notification_deliveries_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status", "created_at");
