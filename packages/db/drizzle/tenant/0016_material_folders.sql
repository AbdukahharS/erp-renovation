CREATE TABLE IF NOT EXISTS "material_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "material_folders_name_active_unique"
	ON "material_folders" (lower("name"))
	WHERE "archived_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "folder_id" uuid;
--> statement-breakpoint
ALTER TABLE "materials"
	ADD CONSTRAINT "materials_folder_id_material_folders_id_fk"
	FOREIGN KEY ("folder_id") REFERENCES "material_folders"("id")
	ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
INSERT INTO "material_folders" ("name")
SELECT DISTINCT trim("category")
FROM "materials"
WHERE "category" IS NOT NULL AND trim("category") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "materials"
SET "folder_id" = "material_folders"."id"
FROM "material_folders"
WHERE lower("material_folders"."name") = lower(trim("materials"."category"))
	AND "materials"."category" IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "materials_category_idx";
--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN IF EXISTS "category";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_folder_id_idx" ON "materials" ("folder_id");
