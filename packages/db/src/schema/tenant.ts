import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Phase 1: placeholder row so the fan-out runner + search_path routing
// can be verified end-to-end. Phase 2 fills this schema with the
// templates / stages / checklists / properties tables.
export const tenantMarker = pgTable("_tenant_marker", {
	id: uuid("id").primaryKey().defaultRandom(),
	label: text("label").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
