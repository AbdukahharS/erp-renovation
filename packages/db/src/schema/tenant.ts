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

// ---------- Phase 3 enums ----------

export const propertyStatusEnum = pgEnum("property_status", [
	"PENDING",
	"READY_FOR_PRODUCTION",
	"IN_PROGRESS",
	"COMPLETED",
	"ARCHIVED",
]);

export const stageInstanceStatusEnum = pgEnum("stage_instance_status", [
	"LOCKED",
	"AVAILABLE",
	"IN_PROGRESS",
	"SUBMITTED",
	"ACCEPTED",
	"REJECTED",
]);

export const layoutTypeEnum = pgEnum("layout_type", ["NEW_BUILD", "SECONDARY"]);

export const assetKindEnum = pgEnum("asset_kind", [
	"FLOOR_PLAN",
	"BEFORE_PHOTO",
	"STAGE_PHOTO",
	"DEFECT_PHOTO",
]);

// ---------- Properties (Phase 3) ----------

export const properties = pgTable(
	"properties",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		address: text("address").notNull(),
		layoutType: layoutTypeEnum("layout_type").notNull(),
		areaSqm: numeric("area_sqm", { precision: 10, scale: 2 }).notNull(),
		plannedUnitCost: numeric("planned_unit_cost", { precision: 14, scale: 2 }).notNull(),
		status: propertyStatusEnum("status").notNull().default("PENDING"),
		templateSnapshotId: uuid("template_snapshot_id"),
		floorPlanAssetId: uuid("floor_plan_asset_id"),
		materialsOnSite: boolean("materials_on_site").notNull().default(false),
		deadlineAt: timestamp("deadline_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("properties_status_idx").on(t.status)],
);

export const propertyAssets = pgTable(
	"property_assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		propertyId: uuid("property_id")
			.notNull()
			.references(() => properties.id, { onDelete: "cascade" }),
		kind: assetKindEnum("kind").notNull(),
		r2Key: text("r2_key").notNull().unique(),
		contentType: text("content_type").notNull(),
		sizeBytes: integer("size_bytes"),
		uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
		uploadedBy: text("uploaded_by"),
	},
	(t) => [index("property_assets_property_idx").on(t.propertyId)],
);

export const stageInstances = pgTable(
	"stage_instances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		propertyId: uuid("property_id")
			.notNull()
			.references(() => properties.id, { onDelete: "cascade" }),
		templateStageId: uuid("template_stage_id"),
		order: integer("order").notNull(),
		name: text("name").notNull(),
	},
	(t) => [
		unique("stage_instances_property_order_unique").on(t.propertyId, t.order),
		index("stage_instances_property_idx").on(t.propertyId),
	],
);

export const subStageInstances = pgTable(
	"sub_stage_instances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		stageInstanceId: uuid("stage_instance_id")
			.notNull()
			.references(() => stageInstances.id, { onDelete: "cascade" }),
		templateSubStageId: uuid("template_sub_stage_id"),
		order: integer("order").notNull(),
		code: text("code").notNull(),
		name: text("name").notNull(),
		performerType: performerTypeEnum("performer_type").notNull(),
		specialization: text("specialization"),
		standardDurationDays: integer("standard_duration_days").notNull().default(1),
		wageAmount: numeric("wage_amount", { precision: 14, scale: 2 }).notNull().default("0"),
		description: text("description"),
		status: stageInstanceStatusEnum("status").notNull().default("LOCKED"),
	},
	(t) => [
		unique("sub_stage_instances_stage_order_unique").on(t.stageInstanceId, t.order),
		index("sub_stage_instances_stage_idx").on(t.stageInstanceId),
		index("sub_stage_instances_status_idx").on(t.status),
	],
);

export const checklistItemInstances = pgTable(
	"checklist_item_instances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		order: integer("order").notNull(),
		text: text("text").notNull(),
		criteria: text("criteria"),
	},
	(t) => [index("checklist_item_instances_sub_stage_idx").on(t.subStageInstanceId)],
);

export const mediaRequirementInstances = pgTable(
	"media_requirement_instances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		mediaType: mediaTypeEnum("media_type").notNull(),
		required: boolean("required").notNull().default(true),
		description: text("description").notNull(),
	},
	(t) => [index("media_requirement_instances_sub_stage_idx").on(t.subStageInstanceId)],
);

export const stageInstanceDependencies = pgTable(
	"stage_instance_dependencies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		prerequisiteSubStageInstanceId: uuid("prerequisite_sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		manualOverride: manualOverrideEnum("manual_override").notNull().default("NONE"),
		overrideBy: text("override_by"),
		overrideAt: timestamp("override_at"),
		overrideReason: text("override_reason"),
	},
	(t) => [
		unique("stage_instance_deps_edge_unique").on(
			t.subStageInstanceId,
			t.prerequisiteSubStageInstanceId,
		),
		index("stage_instance_deps_sub_stage_idx").on(t.subStageInstanceId),
	],
);

export type PropertyStatus = (typeof propertyStatusEnum.enumValues)[number];
export type StageInstanceStatus = (typeof stageInstanceStatusEnum.enumValues)[number];
export type LayoutType = (typeof layoutTypeEnum.enumValues)[number];
export type AssetKind = (typeof assetKindEnum.enumValues)[number];
