-- Public per-property progress share links. Owner mints a slug+password; the
-- customer opens /p/{tenant.slug}/{slug}, enters the password, and views a
-- sanitized progress board (no financials). Rotating the password bumps
-- updated_at, which the view JWT compares against `iat` to invalidate any
-- previously-issued tokens.

CREATE TABLE IF NOT EXISTS property_share_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
	slug text NOT NULL UNIQUE,
	password_hash text NOT NULL,
	created_by_user_id text NOT NULL,
	revoked_at timestamp,
	revoked_by text,
	created_at timestamp NOT NULL DEFAULT now(),
	updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_share_links_property_idx ON property_share_links(property_id);
