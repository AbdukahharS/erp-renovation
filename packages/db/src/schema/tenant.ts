import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
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
		// Manual block is a property of the sub-stage, not of any incoming dep
		// edge: it has to work even for root sub-stages with no prerequisites
		// (e.g. 1.1). FORCE_UNBLOCK remains per-edge (see stageInstanceDependencies).
		manualBlocked: boolean("manual_blocked").notNull().default(false),
		manualBlockedBy: text("manual_blocked_by"),
		manualBlockedAt: timestamp("manual_blocked_at"),
		manualBlockedReason: text("manual_blocked_reason"),
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

// ---------- Phase 4 enums ----------

export const acceptanceResolutionEnum = pgEnum("acceptance_resolution", ["ACCEPTED", "REJECTED"]);

export const stageEventTypeEnum = pgEnum("stage_event_type", [
	"TAKEN_INTO_WORK",
	"SUBMITTED",
	"ACCEPTED",
	"REJECTED",
	"MANUAL_BLOCKED",
	"MANUAL_UNBLOCKED",
	"READY_FOR_PRODUCTION",
	"PROPERTY_IN_PROGRESS",
	"PROPERTY_COMPLETED",
	"UNLOCKED",
]);

// ---------- Phase 4 tables ----------

export const masterProfiles = pgTable(
	"master_profiles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull().unique(),
		displayName: text("display_name").notNull(),
		specializations: text("specializations").array().notNull().default(sql`'{}'::text[]`),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("master_profiles_user_idx").on(t.userId)],
);

export const subStageAssignments = pgTable(
	"sub_stage_assignments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		masterUserId: text("master_user_id").notNull(),
		claimedAt: timestamp("claimed_at").notNull().defaultNow(),
		releasedAt: timestamp("released_at"),
	},
	(t) => [
		uniqueIndex("sub_stage_assignments_active_unique")
			.on(t.subStageInstanceId)
			.where(sql`${t.releasedAt} IS NULL`),
		index("sub_stage_assignments_sub_stage_idx").on(t.subStageInstanceId),
		index("sub_stage_assignments_master_idx").on(t.masterUserId),
	],
);

export const acceptanceRequests = pgTable(
	"acceptance_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		submittedBy: text("submitted_by").notNull(),
		submittedAt: timestamp("submitted_at").notNull().defaultNow(),
		resolvedAt: timestamp("resolved_at"),
		resolution: acceptanceResolutionEnum("resolution"),
		resolvedBy: text("resolved_by"),
	},
	(t) => [
		uniqueIndex("acceptance_requests_active_unique")
			.on(t.subStageInstanceId)
			.where(sql`${t.resolvedAt} IS NULL`),
		index("acceptance_requests_sub_stage_idx").on(t.subStageInstanceId),
	],
);

export const checklistResults = pgTable(
	"checklist_results",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		acceptanceRequestId: uuid("acceptance_request_id")
			.notNull()
			.references(() => acceptanceRequests.id, { onDelete: "cascade" }),
		checklistItemInstanceId: uuid("checklist_item_instance_id")
			.notNull()
			.references(() => checklistItemInstances.id, { onDelete: "cascade" }),
		passed: boolean("passed").notNull(),
		note: text("note"),
		recordedAt: timestamp("recorded_at").notNull().defaultNow(),
	},
	(t) => [
		unique("checklist_results_request_item_unique").on(
			t.acceptanceRequestId,
			t.checklistItemInstanceId,
		),
		index("checklist_results_request_idx").on(t.acceptanceRequestId),
	],
);

export const rejections = pgTable(
	"rejections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		acceptanceRequestId: uuid("acceptance_request_id")
			.notNull()
			.unique()
			.references(() => acceptanceRequests.id, { onDelete: "cascade" }),
		comment: text("comment").notNull(),
		defectAssetId: uuid("defect_asset_id").references(() => propertyAssets.id, {
			onDelete: "set null",
		}),
		rejectedBy: text("rejected_by").notNull(),
		rejectedAt: timestamp("rejected_at").notNull().defaultNow(),
	},
	(t) => [index("rejections_request_idx").on(t.acceptanceRequestId)],
);

export const stageMediaAssets = pgTable(
	"stage_media_assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id")
			.notNull()
			.references(() => subStageInstances.id, { onDelete: "cascade" }),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => propertyAssets.id, { onDelete: "cascade" }),
		uploadedBy: text("uploaded_by").notNull(),
		linkedAt: timestamp("linked_at").notNull().defaultNow(),
	},
	(t) => [
		unique("stage_media_assets_edge_unique").on(t.subStageInstanceId, t.assetId),
		index("stage_media_assets_sub_stage_idx").on(t.subStageInstanceId),
	],
);

export const stageEvents = pgTable(
	"stage_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		subStageInstanceId: uuid("sub_stage_instance_id").references(() => subStageInstances.id, {
			onDelete: "cascade",
		}),
		propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
		eventType: stageEventTypeEnum("event_type").notNull(),
		actorUserId: text("actor_user_id"),
		payload: jsonb("payload"),
		occurredAt: timestamp("occurred_at").notNull().defaultNow(),
		// Reserved for a future outbox-poller fallback; jobs don't read this yet.
		processedAt: timestamp("processed_at"),
	},
	(t) => [
		index("stage_events_sub_stage_idx").on(t.subStageInstanceId, t.occurredAt),
		index("stage_events_property_idx").on(t.propertyId, t.occurredAt),
	],
);

export type AcceptanceResolution = (typeof acceptanceResolutionEnum.enumValues)[number];
export type StageEventType = (typeof stageEventTypeEnum.enumValues)[number];

// ---------- Phase 5: finance + notification intents ----------

export const financialTransactionTypeEnum = pgEnum("financial_transaction_type", [
	"WAGE_CREDIT",
	"BUDGET_DECREMENT",
]);

export const notificationIntentTypeEnum = pgEnum("notification_intent_type", ["STAGE_AVAILABLE"]);

export const notificationIntentStatusEnum = pgEnum("notification_intent_status", [
	"CREATED",
	"SENT",
	"FAILED",
]);

export const masterBalances = pgTable("master_balances", {
	masterUserId: text("master_user_id").primaryKey(),
	balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const financialTransactions = pgTable(
	"financial_transactions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		type: financialTransactionTypeEnum("type").notNull(),
		masterUserId: text("master_user_id"),
		propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
		subStageInstanceId: uuid("sub_stage_instance_id").references(() => subStageInstances.id, {
			onDelete: "set null",
		}),
		amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
		description: text("description"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// Idempotency: a given (sub-stage, type) can be written exactly once even
		// under job retry or double-accept.
		unique("financial_transactions_substage_type_unique").on(t.subStageInstanceId, t.type),
		index("financial_transactions_master_idx").on(t.masterUserId),
		index("financial_transactions_property_idx").on(t.propertyId),
	],
);

export const notificationIntents = pgTable(
	"notification_intents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		type: notificationIntentTypeEnum("type").notNull(),
		targetUserId: text("target_user_id").notNull(),
		subStageInstanceId: uuid("sub_stage_instance_id").references(() => subStageInstances.id, {
			onDelete: "cascade",
		}),
		propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
		payload: jsonb("payload"),
		status: notificationIntentStatusEnum("status").notNull().default("CREATED"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		sentAt: timestamp("sent_at"),
	},
	(t) => [
		// Idempotency for stage-available notifications: one per (user, sub-stage, type).
		unique("notification_intents_target_substage_type_unique").on(
			t.targetUserId,
			t.subStageInstanceId,
			t.type,
		),
		index("notification_intents_status_idx").on(t.status),
		index("notification_intents_target_idx").on(t.targetUserId),
	],
);

export type FinancialTransactionType = (typeof financialTransactionTypeEnum.enumValues)[number];
export type NotificationIntentType = (typeof notificationIntentTypeEnum.enumValues)[number];
export type NotificationIntentStatus = (typeof notificationIntentStatusEnum.enumValues)[number];
