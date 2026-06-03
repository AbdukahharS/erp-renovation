CREATE TYPE "material_unit" AS ENUM('pcs', 'm', 'm2', 'm3', 'kg', 'l');--> statement-breakpoint
CREATE TYPE "material_movement_type" AS ENUM('RECEIPT', 'ISSUANCE', 'ADJUSTMENT', 'REVERSAL');--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" "material_unit" NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"type" "material_movement_type" NOT NULL,
	"delta" numeric(14, 3) NOT NULL,
	"unit_price_snapshot" numeric(14, 2),
	"issuance_id" uuid,
	"actor_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_issuances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price_snapshot" numeric(14, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"transaction_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"issued_by" text NOT NULL,
	"note" text,
	"reversed_at" timestamp,
	"reversed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_movements" ADD CONSTRAINT "material_movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issuances" ADD CONSTRAINT "material_issuances_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issuances" ADD CONSTRAINT "material_issuances_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issuances" ADD CONSTRAINT "material_issuances_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_issuances" ADD CONSTRAINT "material_issuances_movement_id_material_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "material_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "materials_name_active_unique" ON "materials" USING btree ("name") WHERE "materials"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "materials_category_idx" ON "materials" USING btree ("category");--> statement-breakpoint
CREATE INDEX "material_movements_material_idx" ON "material_movements" USING btree ("material_id","created_at");--> statement-breakpoint
CREATE INDEX "material_movements_issuance_idx" ON "material_movements" USING btree ("issuance_id");--> statement-breakpoint
CREATE INDEX "material_issuances_property_idx" ON "material_issuances" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "material_issuances_material_idx" ON "material_issuances" USING btree ("material_id");--> statement-breakpoint
ALTER TABLE "property_costs" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "property_cost_category";--> statement-breakpoint
CREATE TYPE "property_cost_category" AS ENUM('TRANSPORT', 'EXTERNAL_CONTRACTOR', 'OTHER');--> statement-breakpoint
ALTER TABLE "property_costs" ALTER COLUMN "category" SET DATA TYPE "property_cost_category" USING "category"::"property_cost_category";
