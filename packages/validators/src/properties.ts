import { z } from "zod";
import { MediaTypeSchema, PerformerTypeSchema } from "./templates.ts";

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
	kind: z.literal("FLOOR_PLAN"),
	contentType: z.string().min(1),
});

export const AttachFloorPlanInput = z.object({
	assetId: z.string().uuid(),
});
