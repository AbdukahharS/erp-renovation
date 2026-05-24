CREATE TYPE "acceptance_resolution" AS ENUM('ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "stage_event_type" AS ENUM('TAKEN_INTO_WORK', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'MANUAL_BLOCKED', 'MANUAL_UNBLOCKED', 'READY_FOR_PRODUCTION', 'PROPERTY_IN_PROGRESS', 'PROPERTY_COMPLETED', 'UNLOCKED');--> statement-breakpoint
CREATE TABLE "acceptance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolution" "acceptance_resolution",
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "checklist_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acceptance_request_id" uuid NOT NULL,
	"checklist_item_instance_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"note" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_results_request_item_unique" UNIQUE("acceptance_request_id","checklist_item_instance_id")
);
--> statement-breakpoint
CREATE TABLE "master_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"specializations" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acceptance_request_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"defect_asset_id" uuid,
	"rejected_by" text NOT NULL,
	"rejected_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rejections_acceptance_request_id_unique" UNIQUE("acceptance_request_id")
);
--> statement-breakpoint
CREATE TABLE "stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid,
	"property_id" uuid,
	"event_type" "stage_event_type" NOT NULL,
	"actor_user_id" text,
	"payload" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_media_assets_edge_unique" UNIQUE("sub_stage_instance_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "sub_stage_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid NOT NULL,
	"master_user_id" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "acceptance_requests" ADD CONSTRAINT "acceptance_requests_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_results" ADD CONSTRAINT "checklist_results_acceptance_request_id_acceptance_requests_id_fk" FOREIGN KEY ("acceptance_request_id") REFERENCES "acceptance_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_results" ADD CONSTRAINT "checklist_results_checklist_item_instance_id_checklist_item_instances_id_fk" FOREIGN KEY ("checklist_item_instance_id") REFERENCES "checklist_item_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_acceptance_request_id_acceptance_requests_id_fk" FOREIGN KEY ("acceptance_request_id") REFERENCES "acceptance_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejections" ADD CONSTRAINT "rejections_defect_asset_id_property_assets_id_fk" FOREIGN KEY ("defect_asset_id") REFERENCES "property_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_events" ADD CONSTRAINT "stage_events_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_events" ADD CONSTRAINT "stage_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_media_assets" ADD CONSTRAINT "stage_media_assets_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_media_assets" ADD CONSTRAINT "stage_media_assets_asset_id_property_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "property_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_stage_assignments" ADD CONSTRAINT "sub_stage_assignments_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_requests_active_unique" ON "acceptance_requests" USING btree ("sub_stage_instance_id") WHERE "acceptance_requests"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "acceptance_requests_sub_stage_idx" ON "acceptance_requests" USING btree ("sub_stage_instance_id");--> statement-breakpoint
CREATE INDEX "checklist_results_request_idx" ON "checklist_results" USING btree ("acceptance_request_id");--> statement-breakpoint
CREATE INDEX "master_profiles_user_idx" ON "master_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rejections_request_idx" ON "rejections" USING btree ("acceptance_request_id");--> statement-breakpoint
CREATE INDEX "stage_events_sub_stage_idx" ON "stage_events" USING btree ("sub_stage_instance_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stage_events_property_idx" ON "stage_events" USING btree ("property_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stage_media_assets_sub_stage_idx" ON "stage_media_assets" USING btree ("sub_stage_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_stage_assignments_active_unique" ON "sub_stage_assignments" USING btree ("sub_stage_instance_id") WHERE "sub_stage_assignments"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sub_stage_assignments_sub_stage_idx" ON "sub_stage_assignments" USING btree ("sub_stage_instance_id");--> statement-breakpoint
CREATE INDEX "sub_stage_assignments_master_idx" ON "sub_stage_assignments" USING btree ("master_user_id");