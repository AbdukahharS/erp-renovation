-- Link each stage media asset to the specific media requirement it satisfies,
-- so the master UI can present per-requirement upload slots and the server can
-- enforce per-requirement completeness instead of "any media counts".
-- Nullable: ad-hoc/extra uploads (not tied to any required slot) keep NULL.

ALTER TABLE stage_media_assets
	ADD COLUMN requirement_id uuid REFERENCES media_requirement_instances(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX stage_media_assets_requirement_idx ON stage_media_assets (requirement_id);
