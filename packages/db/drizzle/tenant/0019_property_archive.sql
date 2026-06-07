-- Manual archive of unfinished properties. Audit columns capture who archived
-- and why; status transition to ARCHIVED is the same enum value the finance
-- close flow uses, but that flow records its audit on unit_closings so these
-- columns stay NULL for finance-driven archives. Used by the frontend to
-- distinguish manual vs finance archives and gate the un-archive action.

ALTER TABLE properties
	ADD COLUMN archived_at timestamp;
--> statement-breakpoint
ALTER TABLE properties
	ADD COLUMN archived_by text;
--> statement-breakpoint
ALTER TABLE properties
	ADD COLUMN archive_reason text;
