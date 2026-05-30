-- Phase 8 (localization): per-device locale on push_subscriptions, and
-- substitution params on notifications so the in-app center and push-delivery
-- can render in the receiver's locale via @repo/i18n.
ALTER TABLE "push_subscriptions"
	ADD COLUMN IF NOT EXISTS "locale" text NOT NULL DEFAULT 'en';--> statement-breakpoint

ALTER TABLE "notifications"
	ADD COLUMN IF NOT EXISTS "localization_params" jsonb;
