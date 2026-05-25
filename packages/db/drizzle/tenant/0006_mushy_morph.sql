CREATE TYPE "financial_transaction_type" AS ENUM('WAGE_CREDIT', 'BUDGET_DECREMENT');--> statement-breakpoint
CREATE TYPE "notification_intent_status" AS ENUM('CREATED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "notification_intent_type" AS ENUM('STAGE_AVAILABLE');--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "financial_transaction_type" NOT NULL,
	"master_user_id" text,
	"property_id" uuid,
	"sub_stage_instance_id" uuid,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_transactions_substage_type_unique" UNIQUE("sub_stage_instance_id","type")
);
--> statement-breakpoint
CREATE TABLE "master_balances" (
	"master_user_id" text PRIMARY KEY NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_intent_type" NOT NULL,
	"target_user_id" text NOT NULL,
	"sub_stage_instance_id" uuid,
	"property_id" uuid,
	"payload" jsonb,
	"status" "notification_intent_status" DEFAULT 'CREATED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	CONSTRAINT "notification_intents_target_substage_type_unique" UNIQUE("target_user_id","sub_stage_instance_id","type")
);
--> statement-breakpoint
ALTER TABLE "stage_events" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_intents" ADD CONSTRAINT "notification_intents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_transactions_master_idx" ON "financial_transactions" USING btree ("master_user_id");--> statement-breakpoint
CREATE INDEX "financial_transactions_property_idx" ON "financial_transactions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "notification_intents_status_idx" ON "notification_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_intents_target_idx" ON "notification_intents" USING btree ("target_user_id");