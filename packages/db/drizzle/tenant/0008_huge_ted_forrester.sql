CREATE TYPE "property_cost_category" AS ENUM('MATERIAL', 'TRANSPORT', 'EXTERNAL_CONTRACTOR', 'OTHER');--> statement-breakpoint
ALTER TYPE "asset_kind" ADD VALUE 'PORTFOLIO_PHOTO';--> statement-breakpoint
ALTER TYPE "asset_kind" ADD VALUE 'HANDOVER_CERTIFICATE';--> statement-breakpoint
ALTER TYPE "asset_kind" ADD VALUE 'FINAL_REPORT';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'MATERIAL_COST';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'TRANSPORT_COST';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'EXTERNAL_CONTRACTOR_COST';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'OTHER_COST';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'FINE';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'PAYOUT_SETTLEMENT';--> statement-breakpoint
ALTER TYPE "financial_transaction_type" ADD VALUE 'REVERSAL';--> statement-breakpoint
CREATE TABLE "fines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_user_id" text NOT NULL,
	"property_id" uuid,
	"rejection_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"applied_by" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master_user_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"note" text,
	"settled_by" text NOT NULL,
	"settled_at" timestamp DEFAULT now() NOT NULL,
	"transaction_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_assets_edge_unique" UNIQUE("property_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "property_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"category" "property_cost_category" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" text,
	"incurred_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"transaction_id" uuid NOT NULL,
	"reversed_at" timestamp,
	"reversed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"closed_by" text NOT NULL,
	"closed_at" timestamp DEFAULT now() NOT NULL,
	"materials_handover_checked" boolean DEFAULT false NOT NULL,
	"client_handover_checked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"net_profit" numeric(14, 2) NOT NULL,
	"report_snapshot" jsonb NOT NULL,
	"certificate_asset_id" uuid,
	"final_report_asset_id" uuid,
	"reopened_at" timestamp,
	"reopened_by" text,
	CONSTRAINT "unit_closings_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
ALTER TABLE "master_profiles" ADD COLUMN "is_external_contractor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_rejection_id_rejections_id_fk" FOREIGN KEY ("rejection_id") REFERENCES "rejections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_settlements" ADD CONSTRAINT "payout_settlements_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_assets" ADD CONSTRAINT "portfolio_assets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_assets" ADD CONSTRAINT "portfolio_assets_asset_id_property_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "property_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_costs" ADD CONSTRAINT "property_costs_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_costs" ADD CONSTRAINT "property_costs_transaction_id_financial_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_closings" ADD CONSTRAINT "unit_closings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_closings" ADD CONSTRAINT "unit_closings_certificate_asset_id_property_assets_id_fk" FOREIGN KEY ("certificate_asset_id") REFERENCES "property_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_closings" ADD CONSTRAINT "unit_closings_final_report_asset_id_property_assets_id_fk" FOREIGN KEY ("final_report_asset_id") REFERENCES "property_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fines_master_idx" ON "fines" USING btree ("master_user_id");--> statement-breakpoint
CREATE INDEX "fines_property_idx" ON "fines" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fines_rejection_unique" ON "fines" USING btree ("rejection_id") WHERE "fines"."rejection_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payout_settlements_master_idx" ON "payout_settlements" USING btree ("master_user_id");--> statement-breakpoint
CREATE INDEX "portfolio_assets_property_idx" ON "portfolio_assets" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_costs_property_idx" ON "property_costs" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_costs_category_idx" ON "property_costs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "unit_closings_property_idx" ON "unit_closings" USING btree ("property_id");