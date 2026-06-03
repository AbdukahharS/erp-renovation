import { z } from "zod";

export const PerformerTypeSchema = z.enum(["MASTER", "INSPECTOR"]);
export type PerformerType = z.infer<typeof PerformerTypeSchema>;

export const MediaTypeSchema = z.enum(["PHOTO", "VIDEO"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const ManualOverrideSchema = z.enum(["NONE", "BLOCKED", "UNBLOCKED"]);
export type ManualOverride = z.infer<typeof ManualOverrideSchema>;

// ---------- Row shapes (server → client) ----------

export const TemplateSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	isDefault: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const ChecklistItemSchema = z.object({
	id: z.string().uuid(),
	subStageId: z.string().uuid(),
	order: z.number().int(),
	text: z.string(),
	criteria: z.string().nullable(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const MediaRequirementSchema = z.object({
	id: z.string().uuid(),
	subStageId: z.string().uuid(),
	mediaType: MediaTypeSchema,
	required: z.boolean(),
	description: z.string(),
});
export type MediaRequirement = z.infer<typeof MediaRequirementSchema>;

export const SubStageSchema = z.object({
	id: z.string().uuid(),
	stageId: z.string().uuid(),
	order: z.number().int(),
	code: z.string(),
	name: z.string(),
	performerType: PerformerTypeSchema,
	specialization: z.string().nullable(),
	standardDurationDays: z.number().int(),
	wageRatePerSqm: z.string(),
	description: z.string().nullable(),
});
export type SubStage = z.infer<typeof SubStageSchema>;

export const SubStageTreeSchema = SubStageSchema.extend({
	checklistItems: z.array(ChecklistItemSchema),
	mediaRequirements: z.array(MediaRequirementSchema),
});
export type SubStageTree = z.infer<typeof SubStageTreeSchema>;

export const StageSchema = z.object({
	id: z.string().uuid(),
	templateId: z.string().uuid(),
	order: z.number().int(),
	name: z.string(),
});
export type Stage = z.infer<typeof StageSchema>;

export const StageTreeSchema = StageSchema.extend({
	subStages: z.array(SubStageTreeSchema),
});
export type StageTree = z.infer<typeof StageTreeSchema>;

export const TemplateTreeSchema = TemplateSchema.extend({
	stages: z.array(StageTreeSchema),
});
export type TemplateTree = z.infer<typeof TemplateTreeSchema>;

export const StageDependencySchema = z.object({
	id: z.string().uuid(),
	subStageId: z.string().uuid(),
	prerequisiteSubStageId: z.string().uuid(),
	manualOverride: ManualOverrideSchema,
	overrideBy: z.string().nullable(),
	overrideAt: z.string().nullable(),
	overrideReason: z.string().nullable(),
});
export type StageDependency = z.infer<typeof StageDependencySchema>;

export const SpecializationSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
});
export type Specialization = z.infer<typeof SpecializationSchema>;

// ---------- Inputs (client → server) ----------

export const DefaultTemplateLocaleSchema = z.enum(["en", "ru", "uz"]);
export type DefaultTemplateLocale = z.infer<typeof DefaultTemplateLocaleSchema>;

export const CreateTemplateSourceSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("blank") }),
	z.object({ type: z.literal("erp-default"), locale: DefaultTemplateLocaleSchema }),
	z.object({ type: z.literal("clone"), templateId: z.string().uuid() }),
]);
export type CreateTemplateSource = z.infer<typeof CreateTemplateSourceSchema>;

export const CreateTemplateInput = z.object({
	name: z.string().min(1).max(120),
	source: CreateTemplateSourceSchema,
});

export const UpdateTemplateInput = z.object({
	name: z.string().min(1).optional(),
	isDefault: z.boolean().optional(),
});

export const CreateStageInput = z.object({
	name: z.string().min(1),
});

export const UpdateStageInput = z.object({
	name: z.string().min(1),
});

export const ReorderInput = z.object({
	order: z.array(z.object({ id: z.string().uuid(), order: z.number().int().min(1) })).min(1),
});

export const CreateSubStageInput = z.object({
	code: z.string().min(1).max(16),
	name: z.string().min(1),
	performerType: PerformerTypeSchema,
	specialization: z.string().nullable().optional(),
	standardDurationDays: z.number().int().min(0).default(1),
	wageRatePerSqm: z.string().regex(/^\d+(\.\d{1,2})?$/),
	description: z.string().nullable().optional(),
});

export const UpdateSubStageInput = z.object({
	code: z.string().min(1).max(16).optional(),
	name: z.string().min(1).optional(),
	performerType: PerformerTypeSchema.optional(),
	specialization: z.string().nullable().optional(),
	standardDurationDays: z.number().int().min(0).optional(),
	wageRatePerSqm: z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/)
		.optional(),
	description: z.string().nullable().optional(),
});

export const CreateChecklistItemInput = z.object({
	text: z.string().min(1),
	criteria: z.string().nullable().optional(),
});

export const UpdateChecklistItemInput = z.object({
	text: z.string().min(1).optional(),
	criteria: z.string().nullable().optional(),
});

export const CreateMediaRequirementInput = z.object({
	mediaType: MediaTypeSchema,
	required: z.boolean().default(true),
	description: z.string().min(1),
});

export const UpdateMediaRequirementInput = z.object({
	mediaType: MediaTypeSchema.optional(),
	required: z.boolean().optional(),
	description: z.string().min(1).optional(),
});

export const SetManualOverrideInput = z.object({
	manualOverride: ManualOverrideSchema,
	reason: z.string().nullable().optional(),
});

export const CreateSpecializationInput = z.object({
	name: z.string().min(1),
});

// ---------- Template snapshot payload (per-property tailoring) ----------
//
// Shape matches the template tree but strips DB ids and is keyed only by
// document order. Used at property creation when the Owner edits the picked
// template in the wizard — the API uses this payload verbatim instead of
// re-reading the source template from the DB. The chosen `templateId` is
// still recorded on the property (lineage) but the actual instance rows come
// from this payload.

const NumericRate = z.string().regex(/^\d+(\.\d{1,2})?$/);

export const TemplateSnapshotChecklistItemInput = z.object({
	order: z.number().int().min(1),
	text: z.string().min(1),
	criteria: z.string().nullable().optional(),
});

export const TemplateSnapshotMediaRequirementInput = z.object({
	mediaType: MediaTypeSchema,
	required: z.boolean(),
	description: z.string().min(1),
});

export const TemplateSnapshotSubStageInput = z.object({
	order: z.number().int().min(1),
	code: z.string().min(1).max(16),
	name: z.string().min(1),
	performerType: PerformerTypeSchema,
	specialization: z.string().nullable().optional(),
	standardDurationDays: z.number().int().min(0),
	wageRatePerSqm: NumericRate,
	description: z.string().nullable().optional(),
	checklistItems: z.array(TemplateSnapshotChecklistItemInput),
	mediaRequirements: z.array(TemplateSnapshotMediaRequirementInput),
});

export const TemplateSnapshotStageInput = z.object({
	order: z.number().int().min(1),
	name: z.string().min(1),
	subStages: z.array(TemplateSnapshotSubStageInput).min(1),
});

export const TemplateSnapshotInput = z
	.object({
		stages: z.array(TemplateSnapshotStageInput).min(1),
	})
	.superRefine((snap, ctx) => {
		const flat = snap.stages
			.slice()
			.sort((a, b) => a.order - b.order)
			.flatMap((s) => s.subStages.slice().sort((a, b) => a.order - b.order));
		if (flat.length === 0 || flat[0]?.performerType !== "INSPECTOR") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "first sub-stage in document order must be performerType=INSPECTOR (the 1.1 gate)",
				path: ["stages", 0, "subStages", 0, "performerType"],
			});
		}
		for (const stage of snap.stages) {
			const seen = new Set<number>();
			for (const ss of stage.subStages) {
				if (seen.has(ss.order)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `duplicate sub-stage order ${ss.order} in stage`,
						path: ["stages"],
					});
				}
				seen.add(ss.order);
			}
		}
		const stageOrders = new Set<number>();
		for (const s of snap.stages) {
			if (stageOrders.has(s.order)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `duplicate stage order ${s.order}`,
					path: ["stages"],
				});
			}
			stageOrders.add(s.order);
		}
	});

export type TemplateSnapshotInputType = z.infer<typeof TemplateSnapshotInput>;
