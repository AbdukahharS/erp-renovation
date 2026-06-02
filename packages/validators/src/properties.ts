import { z } from "zod";
import { MediaTypeSchema, PerformerTypeSchema, TemplateSnapshotInput } from "./templates.ts";

export const LayoutTypeSchema = z.enum(["NEW_BUILD", "SECONDARY"]);
export type LayoutType = z.infer<typeof LayoutTypeSchema>;

export const PropertyStatusSchema = z.enum([
	"PENDING",
	"READY_FOR_PRODUCTION",
	"IN_PROGRESS",
	"COMPLETED",
	"ARCHIVED",
]);
export type PropertyStatus = z.infer<typeof PropertyStatusSchema>;

export const StageInstanceStatusSchema = z.enum([
	"LOCKED",
	"AVAILABLE",
	"IN_PROGRESS",
	"SUBMITTED",
	"ACCEPTED",
	"REJECTED",
]);
export type StageInstanceStatus = z.infer<typeof StageInstanceStatusSchema>;

export const AssetKindSchema = z.enum([
	"FLOOR_PLAN",
	"BEFORE_PHOTO",
	"STAGE_PHOTO",
	"DEFECT_PHOTO",
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

const Numeric2 = z.string().regex(/^\d+(\.\d{1,2})?$/, "must be a number with up to 2 decimals");

// ---------- Row shapes ----------

export const PropertyRowSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	address: z.string(),
	layoutType: LayoutTypeSchema,
	areaSqm: z.string(),
	plannedUnitCost: z.string(),
	status: PropertyStatusSchema,
	floorPlanAssetId: z.string().uuid().nullable(),
	materialsOnSite: z.boolean(),
	deadlineAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type PropertyRow = z.infer<typeof PropertyRowSchema>;

export const PropertyAssetRowSchema = z.object({
	id: z.string().uuid(),
	propertyId: z.string().uuid(),
	kind: AssetKindSchema,
	r2Key: z.string(),
	contentType: z.string(),
	sizeBytes: z.number().int().nullable(),
	uploadedAt: z.string(),
});
export type PropertyAssetRow = z.infer<typeof PropertyAssetRowSchema>;

export const ChecklistItemInstanceSchema = z.object({
	id: z.string().uuid(),
	subStageInstanceId: z.string().uuid(),
	order: z.number().int(),
	text: z.string(),
	criteria: z.string().nullable(),
});

export const MediaRequirementInstanceSchema = z.object({
	id: z.string().uuid(),
	subStageInstanceId: z.string().uuid(),
	mediaType: MediaTypeSchema,
	required: z.boolean(),
	description: z.string(),
});

export const SubStageInstanceSchema = z.object({
	id: z.string().uuid(),
	stageInstanceId: z.string().uuid(),
	order: z.number().int(),
	code: z.string(),
	name: z.string(),
	performerType: PerformerTypeSchema,
	specialization: z.string().nullable(),
	standardDurationDays: z.number().int(),
	wageAmount: z.string(),
	description: z.string().nullable(),
	status: StageInstanceStatusSchema,
});
export type SubStageInstance = z.infer<typeof SubStageInstanceSchema>;

export const SubStageInstanceTreeSchema = SubStageInstanceSchema.extend({
	checklistItems: z.array(ChecklistItemInstanceSchema),
	mediaRequirements: z.array(MediaRequirementInstanceSchema),
});

export const StageInstanceSchema = z.object({
	id: z.string().uuid(),
	propertyId: z.string().uuid(),
	order: z.number().int(),
	name: z.string(),
});

export const StageInstanceTreeSchema = StageInstanceSchema.extend({
	subStages: z.array(SubStageInstanceTreeSchema),
});

export const PropertyTreeSchema = PropertyRowSchema.extend({
	stages: z.array(StageInstanceTreeSchema),
	floorPlanAsset: PropertyAssetRowSchema.nullable(),
});
export type PropertyTree = z.infer<typeof PropertyTreeSchema>;

export const PropertyListItemSchema = PropertyRowSchema.extend({
	totalMasterSubStages: z.number().int(),
	acceptedMasterSubStages: z.number().int(),
});
export type PropertyListItem = z.infer<typeof PropertyListItemSchema>;

// ---------- Inputs ----------

export const CreatePropertyInput = z.object({
	name: z.string().min(1).max(200),
	address: z.string().min(1).max(500),
	layoutType: LayoutTypeSchema,
	areaSqm: Numeric2.refine((v) => Number(v) > 0, "area must be positive"),
	plannedUnitCost: Numeric2.refine((v) => Number(v) >= 0, "cost must be non-negative"),
	deadlineAt: z.string().datetime().nullable().optional(),
	templateId: z.string().uuid(),
	// When present, the API uses this edited snapshot directly instead of
	// re-reading the source template — lets the Owner tailor the pipeline at
	// property creation without touching the shared template.
	editedSnapshot: TemplateSnapshotInput.optional(),
});
export type CreatePropertyInputType = z.infer<typeof CreatePropertyInput>;

// areaSqm is intentionally NOT updatable — wages are frozen at instantiation
// (Phase 3 §3.2), so editing area post-creation would silently desync the
// snapshotted wage_amount from rate × area. If the area was wrong, delete
// (PENDING only) and recreate.
export const UpdatePropertyInput = z.object({
	name: z.string().min(1).max(200).optional(),
	address: z.string().min(1).max(500).optional(),
	layoutType: LayoutTypeSchema.optional(),
	plannedUnitCost: Numeric2.optional(),
	deadlineAt: z.string().datetime().nullable().optional(),
});

export const PresignAssetUploadInput = z.object({
	kind: z.enum(["FLOOR_PLAN", "PORTFOLIO_PHOTO"]),
	contentType: z.string().min(1),
});

export const AttachFloorPlanInput = z.object({
	assetId: z.string().uuid(),
});

// ---------- Phase 4: acceptance loop ----------

export const AcceptanceResolutionSchema = z.enum(["ACCEPTED", "REJECTED"]);
export type AcceptanceResolution = z.infer<typeof AcceptanceResolutionSchema>;

export const ManualOverrideActionSchema = z.enum(["BLOCK", "UNBLOCK", "FORCE_UNBLOCK"]);
export type ManualOverrideAction = z.infer<typeof ManualOverrideActionSchema>;

// Master profiles (Owner-managed in Phase 4; Phase 6 takes over).
export const MasterProfileSchema = z.object({
	id: z.string().uuid(),
	userId: z.string(),
	displayName: z.string(),
	specializations: z.array(z.string()),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type MasterProfile = z.infer<typeof MasterProfileSchema>;

export const UpsertMasterProfileInput = z.object({
	userId: z.string().min(1),
	displayName: z.string().min(1).max(200),
	specializations: z.array(z.string().min(1)).default([]),
});

export const UpdateMasterProfileInput = z.object({
	displayName: z.string().min(1).max(200).optional(),
	specializations: z.array(z.string().min(1)).optional(),
});

// Stage media — Master/Inspector PWA upload flow.
export const PresignStageMediaInput = z.object({
	mediaType: z.enum(["PHOTO", "VIDEO"]),
	contentType: z.string().min(1),
});

export const AttachStageMediaInput = z.object({
	assetId: z.string().uuid(),
});

export const AttachInspectorMediaInput = z.object({
	assetId: z.string().uuid(),
	kind: z.enum(["BEFORE_PHOTO", "DEFECT_PHOTO"]),
});

export const PresignInspectorMediaInput = z.object({
	kind: z.enum(["BEFORE_PHOTO", "DEFECT_PHOTO"]),
	contentType: z.string().min(1),
});

// Submit / accept / reject inputs.
export const SubmitForAcceptanceInput = z.object({
	// Empty for now; submission is implicit from the active claim. Reserved for
	// extra master-side metadata later (e.g. notes).
});

export const ChecklistResultEntry = z.object({
	checklistItemInstanceId: z.string().uuid(),
	passed: z.boolean(),
	note: z.string().nullable().optional(),
});
export type ChecklistResultEntryType = z.infer<typeof ChecklistResultEntry>;

export const AcceptInput = z.object({
	results: z.array(ChecklistResultEntry).min(0),
});

export const RejectInput = z.object({
	comment: z.string().min(1).max(2000),
	defectAssetId: z.string().uuid().nullable().optional(),
	results: z.array(ChecklistResultEntry).optional(),
});

export const SubmitSelfInspectorInput = z.object({
	materialsOnSite: z.boolean().optional(),
});

export const ManualOverrideInput = z.object({
	action: ManualOverrideActionSchema,
	reason: z.string().min(1).max(500),
});

// List/queue item shapes.
export const MasterAvailableStageSchema = z.object({
	subStageInstanceId: z.string().uuid(),
	propertyId: z.string().uuid(),
	propertyName: z.string(),
	stageName: z.string(),
	code: z.string(),
	name: z.string(),
	specialization: z.string().nullable(),
	wageAmount: z.string(),
	standardDurationDays: z.number().int(),
});

export const MasterMyStageSchema = MasterAvailableStageSchema.extend({
	status: StageInstanceStatusSchema,
});

export const InspectorQueueItemSchema = z.object({
	subStageInstanceId: z.string().uuid(),
	propertyId: z.string().uuid(),
	propertyName: z.string(),
	stageName: z.string(),
	code: z.string(),
	name: z.string(),
	performerType: PerformerTypeSchema,
	status: StageInstanceStatusSchema,
	acceptanceRequestId: z.string().uuid().nullable(),
	submittedBy: z.string().nullable(),
	submittedAt: z.string().nullable(),
});

export const StageMediaAssetView = z.object({
	id: z.string().uuid(),
	assetId: z.string().uuid(),
	kind: AssetKindSchema,
	contentType: z.string(),
	r2Key: z.string(),
	uploadedBy: z.string(),
	uploadedAt: z.string(),
	url: z.string().nullable(),
});

export const StageReviewSchema = z.object({
	subStage: SubStageInstanceTreeSchema,
	stageName: z.string(),
	property: z.object({
		id: z.string().uuid(),
		name: z.string(),
		status: PropertyStatusSchema,
		materialsOnSite: z.boolean(),
	}),
	assignment: z
		.object({
			masterUserId: z.string(),
			claimedAt: z.string(),
		})
		.nullable(),
	activeRequest: z
		.object({
			id: z.string().uuid(),
			submittedBy: z.string(),
			submittedAt: z.string(),
		})
		.nullable(),
	media: z.array(StageMediaAssetView),
	previousResults: z.array(ChecklistResultEntry),
});
