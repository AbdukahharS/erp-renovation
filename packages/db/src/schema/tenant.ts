import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// ---------- Phase 1 placeholder (kept for the isolation test) ----------

export const tenantMarker = pgTable("_tenant_marker", {
	id: uuid("id").primaryKey().defaultRandom(),
	label: text("label").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Phase 2 enums ----------

export const performerTypeEnum = pgEnum("performer_type", ["MASTER", "INSPECTOR"]);
export const mediaTypeEnum = pgEnum("media_type", ["PHOTO", "VIDEO"]);
export const manualOverrideEnum = pgEnum("manual_override", ["NONE", "BLOCKED", "UNBLOCKED"]);

// ---------- Templates ----------

export const templates = pgTable(
	"templates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [uniqueIndex("templates_one_default").on(t.isDefault).where(sql`${t.isDefault} = true`)],
);

export const stages = pgTable(
	"stages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		templateId: uuid("template_id")
			.notNull()
			.references(() => templates.id, { onDelete: "cascade" }),
		order: integer("order").notNull(),
		name: text("name").notNull(),
	},
	(t) => [
		unique("stages_template_order_unique").on(t.templateId, t.order),
		index("stages_template_idx").on(t.templateId),
	],
);

export const subStages = pgTable(
	"sub_stages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		stageId: uuid("stage_id")
			.notNull()
			.references(() => stages.id, { onDelete: "cascade" }),
		order: integer("order").notNull(),
		code: text("code").notNull(),
		name: text("name").notNull(),
		performerType: performerTypeEnum("performer_type").notNull(),
		specialization: text("specialization"),
		standardDurationDays: integer("standard_duration_days").notNull().default(1),
		wageRatePerSqm: numeric("wage_rate_per_sqm", { precision: 10, scale: 2 })
			.notNull()
			.default("0"),
		description: text("description"),
	},
	(t) => [
		unique("sub_stages_stage_order_unique").on(t.stageId, t.order),
		index("sub_stages_stage_idx").on(t.stageId),
	],
);

export const checklistItems = pgTable(
	"checklist_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageId: uuid("sub_stage_id")
			.notNull()
			.references(() => subStages.id, { onDelete: "cascade" }),
		order: integer("order").notNull(),
		text: text("text").notNull(),
		criteria: text("criteria"),
	},
	(t) => [index("checklist_items_sub_stage_idx").on(t.subStageId)],
);

export const mediaRequirements = pgTable(
	"media_requirements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageId: uuid("sub_stage_id")
			.notNull()
			.references(() => subStages.id, { onDelete: "cascade" }),
		mediaType: mediaTypeEnum("media_type").notNull(),
		required: boolean("required").notNull().default(true),
		description: text("description").notNull(),
	},
	(t) => [index("media_requirements_sub_stage_idx").on(t.subStageId)],
);

export const specializations = pgTable("specializations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(),
});

export const stageDependencies = pgTable(
	"stage_dependencies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageId: uuid("sub_stage_id")
			.notNull()
			.references(() => subStages.id, { onDelete: "cascade" }),
		prerequisiteSubStageId: uuid("prerequisite_sub_stage_id")
			.notNull()
			.references(() => subStages.id, { onDelete: "cascade" }),
		manualOverride: manualOverrideEnum("manual_override").notNull().default("NONE"),
		overrideBy: text("override_by"),
		overrideAt: timestamp("override_at"),
		overrideReason: text("override_reason"),
	},
	(t) => [
		unique("stage_dependencies_edge_unique").on(t.subStageId, t.prerequisiteSubStageId),
		index("stage_dependencies_sub_stage_idx").on(t.subStageId),
	],
);

export type PerformerType = (typeof performerTypeEnum.enumValues)[number];
export type MediaType = (typeof mediaTypeEnum.enumValues)[number];
export type ManualOverride = (typeof manualOverrideEnum.enumValues)[number];
