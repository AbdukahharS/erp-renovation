CREATE TYPE "manual_override" AS ENUM('NONE', 'BLOCKED', 'UNBLOCKED');--> statement-breakpoint
CREATE TYPE "media_type" AS ENUM('PHOTO', 'VIDEO');--> statement-breakpoint
CREATE TYPE "performer_type" AS ENUM('MASTER', 'INSPECTOR');--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"text" text NOT NULL,
	"criteria" text
);
--> statement-breakpoint
CREATE TABLE "media_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specializations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "specializations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "stage_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_stage_id" uuid NOT NULL,
	"prerequisite_sub_stage_id" uuid NOT NULL,
	"manual_override" "manual_override" DEFAULT 'NONE' NOT NULL,
	"override_by" text,
	"override_at" timestamp,
	"override_reason" text,
	CONSTRAINT "stage_dependencies_edge_unique" UNIQUE("sub_stage_id","prerequisite_sub_stage_id")
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "stages_template_order_unique" UNIQUE("template_id","order")
);
--> statement-breakpoint
CREATE TABLE "sub_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"performer_type" "performer_type" NOT NULL,
	"specialization" text,
	"standard_duration_days" integer DEFAULT 1 NOT NULL,
	"wage_rate_per_sqm" numeric(10, 2) DEFAULT '0' NOT NULL,
	"description" text,
	CONSTRAINT "sub_stages_stage_order_unique" UNIQUE("stage_id","order")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_sub_stage_id_sub_stages_id_fk" FOREIGN KEY ("sub_stage_id") REFERENCES "sub_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_requirements" ADD CONSTRAINT "media_requirements_sub_stage_id_sub_stages_id_fk" FOREIGN KEY ("sub_stage_id") REFERENCES "sub_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_dependencies" ADD CONSTRAINT "stage_dependencies_sub_stage_id_sub_stages_id_fk" FOREIGN KEY ("sub_stage_id") REFERENCES "sub_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_dependencies" ADD CONSTRAINT "stage_dependencies_prerequisite_sub_stage_id_sub_stages_id_fk" FOREIGN KEY ("prerequisite_sub_stage_id") REFERENCES "sub_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_stages" ADD CONSTRAINT "sub_stages_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_sub_stage_idx" ON "checklist_items" USING btree ("sub_stage_id");--> statement-breakpoint
CREATE INDEX "media_requirements_sub_stage_idx" ON "media_requirements" USING btree ("sub_stage_id");--> statement-breakpoint
CREATE INDEX "stage_dependencies_sub_stage_idx" ON "stage_dependencies" USING btree ("sub_stage_id");--> statement-breakpoint
CREATE INDEX "stages_template_idx" ON "stages" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "sub_stages_stage_idx" ON "sub_stages" USING btree ("stage_id");