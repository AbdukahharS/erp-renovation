ALTER TABLE "financial_transactions" ADD COLUMN "description_key" text;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD COLUMN "description_params" jsonb;
