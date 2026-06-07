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
	"PORTFOLIO_PHOTO",
	"HANDOVER_CERTIFICATE",
	"FINAL_REPORT",
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
		phone: text("phone"),
		availabilityOverride: text("availability_override"),
		availabilityOverrideUntil: timestamp("availability_override_until"),
		// Phase 7: masters whose work is paid as a flat external cost (e.g.
		// TZ 8.1 cleaning company) rather than per-m² wages. Excluded from
		// wage credits; their cost lands in property_costs as
		// EXTERNAL_CONTRACTOR.
		isExternalContractor: boolean("is_external_contractor").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("master_profiles_user_idx").on(t.userId)],
);

// ---------- Phase 6: master rating counters ----------
//
// Raw counters only — Phase 9 will layer a composite score on top.
// Recomputed in full on every ACCEPTED/REJECTED event affecting the master.

export const masterRatings = pgTable("master_ratings", {
	masterUserId: text("master_user_id").primaryKey(),
	acceptedCount: integer("accepted_count").notNull().default(0),
	rejectedCount: integer("rejected_count").notNull().default(0),
	avgDurationRatio: numeric("avg_duration_ratio", { precision: 6, scale: 3 }),
	computedAt: timestamp("computed_at").notNull().defaultNow(),
});

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
		requirementId: uuid("requirement_id").references(() => mediaRequirementInstances.id, {
			onDelete: "set null",
		}),
		uploadedBy: text("uploaded_by").notNull(),
		linkedAt: timestamp("linked_at").notNull().defaultNow(),
	},
	(t) => [
		unique("stage_media_assets_edge_unique").on(t.subStageInstanceId, t.assetId),
		index("stage_media_assets_sub_stage_idx").on(t.subStageInstanceId),
		index("stage_media_assets_requirement_idx").on(t.requirementId),
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
	// Phase 7: non-wage costs (authored via property_costs).
	"MATERIAL_COST",
	"TRANSPORT_COST",
	"EXTERNAL_CONTRACTOR_COST",
	"OTHER_COST",
	// Phase 7: fines applied by inspectors against master balances.
	"FINE",
	// Phase 7: settled payouts (manual mark-paid) — negative against balance.
	"PAYOUT_SETTLEMENT",
	// Phase 7: inverse rows for soft reversal of authoring entries pre-closing.
	"REVERSAL",
]);

// Phase 7: category for manual cost entries against a property. Each category
// has a paired entry in financial_transactions for dashboard aggregation.
//
// MATERIAL is intentionally absent: material costs now originate exclusively
// from warehouse issuances (see materials/material_issuances below), which
// write MATERIAL_COST financial_transactions rows directly. Manual cost
// authoring is reserved for off-warehouse expenses (transport, external
// contractors, other).
export const propertyCostCategoryEnum = pgEnum("property_cost_category", [
	"TRANSPORT",
	"EXTERNAL_CONTRACTOR",
	"OTHER",
]);

export const notificationIntentTypeEnum = pgEnum("notification_intent_type", [
	"STAGE_AVAILABLE",
	"STAGE_SUBMITTED",
	"STAGE_REJECTED",
	"STAGE_BLOCKED",
	"STAGE_UNBLOCKED",
]);

export const notificationIntentStatusEnum = pgEnum("notification_intent_status", [
	"CREATED",
	"SENT",
	"FAILED",
]);

// ---------- Phase 8 enums ----------

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
	"PENDING",
	"SENT",
	"FAILED",
	"GONE",
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
		// Structured i18n payload: clients render `t(descriptionKey, descriptionParams)`.
		// Free-form `description` is the fallback for operator-supplied notes.
		descriptionKey: text("description_key"),
		descriptionParams: jsonb("description_params"),
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
		// Phase 8: set when notification-dispatch produces the in-app notification
		// row. Nullable for back-compat with intents not yet dispatched.
		notificationId: uuid("notification_id"),
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

// ---------- Phase 7: finance authoring + unit closing ----------

// Authoring side of non-wage costs. Each row pairs with a matching financial
// transaction (same id stored as transactionId) so the dashboard aggregates
// solely from financial_transactions. Reversals insert a REVERSAL transaction
// and flag the originating row as reversed.
export const propertyCosts = pgTable(
	"property_costs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		propertyId: uuid("property_id")
			.notNull()
			.references(() => properties.id, { onDelete: "cascade" }),
		category: propertyCostCategoryEnum("category").notNull(),
		amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
		description: text("description"),
		incurredAt: timestamp("incurred_at").notNull().defaultNow(),
		createdBy: text("created_by").notNull(),
		transactionId: uuid("transaction_id")
			.notNull()
			.references(() => financialTransactions.id, { onDelete: "restrict" }),
		reversedAt: timestamp("reversed_at"),
		reversedBy: text("reversed_by"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("property_costs_property_idx").on(t.propertyId),
		index("property_costs_category_idx").on(t.category),
	],
);

// Fines authored by inspectors. Each fine pairs with a FINE financial
// transaction (negative amount) and decrements the master's balance.
export const fines = pgTable(
	"fines",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		masterUserId: text("master_user_id").notNull(),
		propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
		rejectionId: uuid("rejection_id").references(() => rejections.id, { onDelete: "set null" }),
		amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
		reason: text("reason").notNull(),
		appliedBy: text("applied_by").notNull(),
		transactionId: uuid("transaction_id")
			.notNull()
			.references(() => financialTransactions.id, { onDelete: "restrict" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("fines_master_idx").on(t.masterUserId),
		index("fines_property_idx").on(t.propertyId),
		// At most one fine per rejection.
		uniqueIndex("fines_rejection_unique")
			.on(t.rejectionId)
			.where(sql`${t.rejectionId} IS NOT NULL`),
	],
);

// Manual mark-paid against a master balance. Pairs with a PAYOUT_SETTLEMENT
// transaction that subtracts from the balance.
export const payoutSettlements = pgTable(
	"payout_settlements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		masterUserId: text("master_user_id").notNull(),
		amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
		note: text("note"),
		settledBy: text("settled_by").notNull(),
		settledAt: timestamp("settled_at").notNull().defaultNow(),
		transactionId: uuid("transaction_id")
			.notNull()
			.references(() => financialTransactions.id, { onDelete: "restrict" }),
	},
	(t) => [index("payout_settlements_master_idx").on(t.masterUserId)],
);

// One closing per property. reportSnapshot freezes the Plan-vs-Actual numbers
// at closing time so later cost edits don't retroactively alter the report.
export const unitClosings = pgTable(
	"unit_closings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		propertyId: uuid("property_id")
			.notNull()
			.references(() => properties.id, { onDelete: "cascade" }),
		closedBy: text("closed_by").notNull(),
		closedAt: timestamp("closed_at").notNull().defaultNow(),
		materialsHandoverChecked: boolean("materials_handover_checked").notNull().default(false),
		clientHandoverChecked: boolean("client_handover_checked").notNull().default(false),
		notes: text("notes"),
		netProfit: numeric("net_profit", { precision: 14, scale: 2 }).notNull(),
		reportSnapshot: jsonb("report_snapshot").notNull(),
		certificateAssetId: uuid("certificate_asset_id").references(() => propertyAssets.id, {
			onDelete: "set null",
		}),
		finalReportAssetId: uuid("final_report_asset_id").references(() => propertyAssets.id, {
			onDelete: "set null",
		}),
		reopenedAt: timestamp("reopened_at"),
		reopenedBy: text("reopened_by"),
	},
	(t) => [
		index("unit_closings_property_idx").on(t.propertyId),
		// At most one active (non-reopened) closing per property. Reopened rows
		// stay as audit history so reports of past closes survive — the audit
		// trail the spec requires (PHASE-7 §7.4 "reversible by Owner only,
		// audited") is exactly this row preserved with reopenedAt/reopenedBy.
		uniqueIndex("unit_closings_property_active_unique")
			.on(t.propertyId)
			.where(sql`${t.reopenedAt} IS NULL`),
	],
);

// Links portfolio photos uploaded at closing to the property.
export const portfolioAssets = pgTable(
	"portfolio_assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		propertyId: uuid("property_id")
			.notNull()
			.references(() => properties.id, { onDelete: "cascade" }),
		assetId: uuid("asset_id")
			.notNull()
			.references(() => propertyAssets.id, { onDelete: "cascade" }),
		uploadedBy: text("uploaded_by").notNull(),
		linkedAt: timestamp("linked_at").notNull().defaultNow(),
	},
	(t) => [
		unique("portfolio_assets_edge_unique").on(t.propertyId, t.assetId),
		index("portfolio_assets_property_idx").on(t.propertyId),
	],
);

export type PropertyCostCategory = (typeof propertyCostCategoryEnum.enumValues)[number];

// ---------- Phase 8: in-app notifications + push delivery ----------

// In-app notification record. Written by notification-dispatch from a
// notification_intents row (intent_id set), or by direct emitters for
// notification types that bypass intents (e.g. ad-hoc system messages —
// none today, intent_id nullable for that future path).
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		recipientUserId: text("recipient_user_id").notNull(),
		type: notificationIntentTypeEnum("type").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		// Deep link the PWA should navigate to on tap (e.g. /master/stages/<id>).
		targetUrl: text("target_url"),
		propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
		subStageInstanceId: uuid("sub_stage_instance_id").references(() => subStageInstances.id, {
			onDelete: "set null",
		}),
		intentId: uuid("intent_id"),
		// Phase 8 (localization): substitution params for re-rendering the
		// title/body in the receiver's locale. When present, both push-delivery
		// and the in-app center prefer translating via @repo/i18n over the
		// stored English fallback in title/body. Nullable for rows written
		// before this column existed.
		localizationParams: jsonb("localization_params"),
		readAt: timestamp("read_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// Idempotent dispatch: one in-app row per intent. Partial unique so direct
		// (intent-less) notifications can coexist without colliding.
		// Plain UNIQUE (not a partial index): Postgres treats multiple NULLs as
		// distinct, so direct (intent-less) notifications coexist, and a plain
		// constraint lets `ON CONFLICT (intent_id) DO NOTHING` work without
		// having to repeat the index predicate.
		unique("notifications_intent_unique").on(t.intentId),
		index("notifications_recipient_created_idx").on(t.recipientUserId, t.createdAt),
		index("notifications_recipient_unread_idx")
			.on(t.recipientUserId, t.createdAt)
			.where(sql`${t.readAt} IS NULL`),
	],
);

// Per-device Web Push subscription. One row per (user, browser/device). The
// endpoint URL is globally unique across the push service, so it doubles as
// the natural key for upsert.
export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").notNull(),
		endpoint: text("endpoint").notNull().unique(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		userAgent: text("user_agent"),
		// Phase 8 (localization): device locale set at subscribe time and
		// refreshed on app load / language switch. push-delivery renders the
		// push payload via @repo/i18n in this locale.
		locale: text("locale").notNull().default("en"),
		failureCount: integer("failure_count").notNull().default(0),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
	},
	(t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

// Per-(notification, subscription) send attempt. Lets us audit failures and
// retry transient errors without re-creating the in-app row.
export const notificationDeliveries = pgTable(
	"notification_deliveries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		notificationId: uuid("notification_id")
			.notNull()
			.references(() => notifications.id, { onDelete: "cascade" }),
		subscriptionId: uuid("subscription_id")
			.notNull()
			.references(() => pushSubscriptions.id, { onDelete: "cascade" }),
		status: notificationDeliveryStatusEnum("status").notNull().default("PENDING"),
		attemptCount: integer("attempt_count").notNull().default(0),
		lastError: text("last_error"),
		lastAttemptAt: timestamp("last_attempt_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique("notification_deliveries_notif_sub_unique").on(t.notificationId, t.subscriptionId),
		index("notification_deliveries_status_idx").on(t.status, t.createdAt),
	],
);

export type NotificationDeliveryStatus = (typeof notificationDeliveryStatusEnum.enumValues)[number];

// ---------- Warehouse & Materials ----------
//
// One implicit warehouse per tenant (the tenant schema IS the warehouse — no
// `warehouses` table). Materials carry a current price; issuances to a
// property snapshot that price at the moment of issuance so historical costs
// never drift when the price is later edited.
//
// On-hand quantity is NEVER stored — it is the sum of `material_movements.delta`
// for the material. Every quantity change (RECEIPT, ISSUANCE, ADJUSTMENT,
// REVERSAL) goes through the ledger; the ledger is the single source of truth.
//
// `material_issuances` pairs one-to-one with:
//   - a MATERIAL_COST `financial_transactions` row (for Plan-vs-Actual)
//   - an ISSUANCE `material_movements` row (for stock)
// Reversing an issuance inserts an inverse REVERSAL row in both ledgers and
// stamps the issuance row with reversedAt/reversedBy. Mirrors the
// reversePropertyCost pattern from finance/service.ts so the audit trail is
// consistent across the codebase.

export const materialUnitEnum = pgEnum("material_unit", ["pcs", "m", "m2", "m3", "kg", "l"]);

export const materialMovementTypeEnum = pgEnum("material_movement_type", [
	"RECEIPT",
	"ISSUANCE",
	"ADJUSTMENT",
	"REVERSAL",
]);

export const materialFolders = pgTable(
	"material_folders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("material_folders_name_active_unique")
			.on(sql`lower(${t.name})`)
			.where(sql`${t.archivedAt} IS NULL`),
	],
);

export const materials = pgTable(
	"materials",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		folderId: uuid("folder_id").references(() => materialFolders.id, { onDelete: "set null" }),
		unit: materialUnitEnum("unit").notNull(),
		price: numeric("price", { precision: 14, scale: 2 }).notNull(),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("materials_name_active_unique").on(t.name).where(sql`${t.archivedAt} IS NULL`),
		index("materials_folder_id_idx").on(t.folderId),
	],
);

export const materialMovements = pgTable(
	"material_movements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materials.id, { onDelete: "restrict" }),
		type: materialMovementTypeEnum("type").notNull(),
		// Signed: positive for RECEIPT/REVERSAL, negative for ISSUANCE; ADJUSTMENT
		// can go either way. 3dp so kg/m can carry fractional quantities.
		delta: numeric("delta", { precision: 14, scale: 3 }).notNull(),
		unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 14, scale: 2 }),
		// Self-link: ISSUANCE rows reference their parent material_issuances row;
		// REVERSAL rows reference the issuance being reversed. Nullable for
		// RECEIPT/ADJUSTMENT.
		issuanceId: uuid("issuance_id"),
		actorUserId: text("actor_user_id").notNull(),
		reason: text("reason"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("material_movements_material_idx").on(t.materialId, t.createdAt),
		index("material_movements_issuance_idx").on(t.issuanceId),
	],
);

export const materialIssuances = pgTable(
	"material_issuances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		propertyId: uuid("property_id")
			.notNull()
			.references(() => properties.id, { onDelete: "restrict" }),
		materialId: uuid("material_id")
			.notNull()
			.references(() => materials.id, { onDelete: "restrict" }),
		quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
		unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 14, scale: 2 }).notNull(),
		amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
		// Paired MATERIAL_COST row in financial_transactions (same pattern as
		// property_costs.transactionId). On reverse, a REVERSAL transaction is
		// added separately — the original transaction row stays intact.
		transactionId: uuid("transaction_id")
			.notNull()
			.references(() => financialTransactions.id, { onDelete: "restrict" }),
		// The negative-delta ISSUANCE row in material_movements.
		movementId: uuid("movement_id")
			.notNull()
			.references(() => materialMovements.id, { onDelete: "restrict" }),
		issuedBy: text("issued_by").notNull(),
		note: text("note"),
		reversedAt: timestamp("reversed_at"),
		reversedBy: text("reversed_by"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("material_issuances_property_idx").on(t.propertyId),
		index("material_issuances_material_idx").on(t.materialId),
	],
);

export type MaterialUnit = (typeof materialUnitEnum.enumValues)[number];
export type MaterialMovementType = (typeof materialMovementTypeEnum.enumValues)[number];
