import type { useTemplateMutations } from "@/lib/queries/templates";

/**
 * Abstract operations the template editor components dispatch. Mutation-mode
 * (templates page) and local-state mode (property-creation wizard) both
 * provide an `EditorOps` so the UI components don't need to know which path
 * persists changes.
 *
 * Note: ops are synchronous fire-and-forget. The mutation-mode implementation
 * runs an async mutation (with toast/error handling living in the mutation
 * layer). The local-state implementation mutates a React state setter
 * synchronously. Either way, the calling component never awaits.
 */
export type EditorOps = {
	renameTemplate?: (name: string) => void;
	addStage: (name: string) => void;
	renameStage: (id: string, name: string) => void;
	deleteStage: (id: string) => void;
	reorderStages: (order: { id: string; order: number }[]) => void;
	addSubStage: (
		stageId: string,
		vars: {
			code: string;
			name: string;
			performerType: "MASTER" | "INSPECTOR";
			wageRatePerSqm: string;
			standardDurationDays: number;
		},
	) => void;
	updateSubStage: (id: string, patch: Record<string, unknown>) => void;
	deleteSubStage: (id: string) => void;
	reorderSubStages: (stageId: string, order: { id: string; order: number }[]) => void;
	addChecklistItem: (subStageId: string, vars: { text: string; criteria?: string | null }) => void;
	updateChecklistItem: (id: string, patch: { text?: string; criteria?: string | null }) => void;
	deleteChecklistItem: (id: string) => void;
	addMediaRequirement: (
		subStageId: string,
		vars: { mediaType: "PHOTO" | "VIDEO"; required: boolean; description: string },
	) => void;
	updateMediaRequirement: (
		id: string,
		patch: { mediaType?: "PHOTO" | "VIDEO"; required?: boolean; description?: string },
	) => void;
	deleteMediaRequirement: (id: string) => void;
};

type Mutators = ReturnType<typeof useTemplateMutations>;

export function opsFromMutators(m: Mutators): EditorOps {
	return {
		renameTemplate: (name) => m.renameTemplate.mutate(name),
		addStage: (name) => m.addStage.mutate(name),
		renameStage: (id, name) => m.renameStage.mutate({ id, name }),
		deleteStage: (id) => m.deleteStage.mutate(id),
		reorderStages: (order) => m.reorderStages.mutate(order),
		addSubStage: (stageId, vars) =>
			m.addSubStage.mutate({
				stageId,
				code: vars.code,
				name: vars.name,
				performerType: vars.performerType,
				wageRatePerSqm: vars.wageRatePerSqm,
				standardDurationDays: vars.standardDurationDays,
			}),
		updateSubStage: (id, patch) => m.updateSubStage.mutate({ id, patch }),
		deleteSubStage: (id) => m.deleteSubStage.mutate(id),
		reorderSubStages: (stageId, order) => m.reorderSubStages.mutate({ stageId, order }),
		addChecklistItem: (subStageId, vars) =>
			m.addChecklistItem.mutate({
				subStageId,
				text: vars.text,
				criteria: vars.criteria ?? null,
			}),
		updateChecklistItem: (id, patch) => m.updateChecklistItem.mutate({ id, patch }),
		deleteChecklistItem: (id) => m.deleteChecklistItem.mutate(id),
		addMediaRequirement: (subStageId, vars) =>
			m.addMediaRequirement.mutate({
				subStageId,
				mediaType: vars.mediaType,
				required: vars.required,
				description: vars.description,
			}),
		updateMediaRequirement: (id, patch) => m.updateMediaRequirement.mutate({ id, patch }),
		deleteMediaRequirement: (id) => m.deleteMediaRequirement.mutate(id),
	};
}
