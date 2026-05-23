CREATE TYPE "asset_kind" AS ENUM('FLOOR_PLAN', 'BEFORE_PHOTO', 'STAGE_PHOTO', 'DEFECT_PHOTO');--> statement-breakpoint
CREATE TYPE "layout_type" AS ENUM('NEW_BUILD', 'SECONDARY');--> statement-breakpoint
CREATE TYPE "property_status" AS ENUM('PENDING', 'READY_FOR_PRODUCTION', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "stage_instance_status" AS ENUM('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'SUBMITTED', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "checklist_item_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"text" text NOT NULL,
	"criteria" text
);
--> statement-breakpoint
CREATE TABLE "media_requirement_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"layout_type" "layout_type" NOT NULL,
	"area_sqm" numeric(10, 2) NOT NULL,
	"planned_unit_cost" numeric(14, 2) NOT NULL,
	"status" "property_status" DEFAULT 'PENDING' NOT NULL,
	"template_snapshot_id" uuid,
	"floor_plan_asset_id" uuid,
	"materials_on_site" boolean DEFAULT false NOT NULL,
	"deadline_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by" text,
	CONSTRAINT "property_assets_r2_key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "stage_instance_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_instance_id" uuid NOT NULL,
	"prerequisite_sub_stage_instance_id" uuid NOT NULL,
	"manual_override" "manual_override" DEFAULT 'NONE' NOT NULL,
	"override_by" text,
	"override_at" timestamp,
	"override_reason" text,
	CONSTRAINT "stage_instance_deps_edge_unique" UNIQUE("sub_stage_instance_id","prerequisite_sub_stage_instance_id")
);
--> statement-breakpoint
CREATE TABLE "stage_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"template_stage_id" uuid,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "stage_instances_property_order_unique" UNIQUE("property_id","order")
);
--> statement-breakpoint
CREATE TABLE "sub_stage_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_instance_id" uuid NOT NULL,
	"template_sub_stage_id" uuid,
	"order" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"performer_type" "performer_type" NOT NULL,
	"specialization" text,
	"standard_duration_days" integer DEFAULT 1 NOT NULL,
	"wage_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"status" "stage_instance_status" DEFAULT 'LOCKED' NOT NULL,
	CONSTRAINT "sub_stage_instances_stage_order_unique" UNIQUE("stage_instance_id","order")
);
--> statement-breakpoint
ALTER TABLE "checklist_item_instances" ADD CONSTRAINT "checklist_item_instances_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_requirement_instances" ADD CONSTRAINT "media_requirement_instances_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_assets" ADD CONSTRAINT "property_assets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_instance_dependencies" ADD CONSTRAINT "stage_instance_dependencies_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_instance_dependencies" ADD CONSTRAINT "stage_instance_dependencies_prerequisite_sub_stage_instance_id_sub_stage_instances_id_fk" FOREIGN KEY ("prerequisite_sub_stage_instance_id") REFERENCES "sub_stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_instances" ADD CONSTRAINT "stage_instances_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_stage_instances" ADD CONSTRAINT "sub_stage_instances_stage_instance_id_stage_instances_id_fk" FOREIGN KEY ("stage_instance_id") REFERENCES "stage_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_item_instances_sub_stage_idx" ON "checklist_item_instances" USING btree ("sub_stage_instance_id");--> statement-breakpoint
CREATE INDEX "media_requirement_instances_sub_stage_idx" ON "media_requirement_instances" USING btree ("sub_stage_instance_id");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "property_assets_property_idx" ON "property_assets" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "stage_instance_deps_sub_stage_idx" ON "stage_instance_dependencies" USING btree ("sub_stage_instance_id");--> statement-breakpoint
CREATE INDEX "stage_instances_property_idx" ON "stage_instances" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "sub_stage_instances_stage_idx" ON "sub_stage_instances" USING btree ("stage_instance_id");--> statement-breakpoint
CREATE INDEX "sub_stage_instances_status_idx" ON "sub_stage_instances" USING btree ("status");