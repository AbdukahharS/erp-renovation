import type { CreateTemplateSource, Template, TemplateTree } from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

export const templateKeys = {
	all: ["templates"] as const,
	list: () => [...templateKeys.all, "list"] as const,
	tree: (id: string) => [...templateKeys.all, "tree", id] as const,
};

// Eden infers `Date` for Drizzle timestamp columns even though the wire
// format is an ISO string; validators model the wire shape correctly. The
// `as unknown as Promise<…>` casts below bridge that single divergence.

export function useTemplatesList() {
	return useQuery({
		queryKey: templateKeys.list(),
		queryFn: () => unwrap(api.templates.get()) as unknown as Promise<Template[]>,
	});
}

export function useTemplateTree(id: string | undefined) {
	return useQuery({
		queryKey: id ? templateKeys.tree(id) : ["templates", "tree", "none"],
		queryFn: () =>
			unwrap(api.templates({ templateId: id as string }).get()) as unknown as Promise<TemplateTree>,
		enabled: !!id,
	});
}

export function useCreateTemplate() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { name: string; source: CreateTemplateSource }) =>
			unwrap(api.templates.post(vars)) as unknown as Promise<Template>,
		onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.list() }),
	});
}

export function useDeleteTemplate() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => unwrap(api.templates({ templateId: id }).delete()),
		onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.list() }),
	});
}

export function useTemplateMutations(templateId: string | undefined) {
	const qc = useQueryClient();
	const invalidate = () => {
		if (templateId) qc.invalidateQueries({ queryKey: templateKeys.tree(templateId) });
		qc.invalidateQueries({ queryKey: templateKeys.list() });
	};
	const tid = templateId as string;

	return {
		renameTemplate: useMutation({
			mutationFn: (name: string) => unwrap(api.templates({ templateId: tid }).patch({ name })),
			onSuccess: invalidate,
		}),
		addStage: useMutation({
			mutationFn: (name: string) =>
				unwrap(api.templates({ templateId: tid }).stages.post({ name })),
			onSuccess: invalidate,
		}),
		renameStage: useMutation({
			mutationFn: (vars: { id: string; name: string }) =>
				unwrap(api.stages({ stageId: vars.id }).patch({ name: vars.name })),
			onSuccess: invalidate,
		}),
		deleteStage: useMutation({
			mutationFn: (id: string) => unwrap(api.stages({ stageId: id }).delete()),
			onSuccess: invalidate,
		}),
		reorderStages: useMutation({
			mutationFn: (order: { id: string; order: number }[]) =>
				unwrap(api.templates({ templateId: tid }).stages.reorder.post({ order })),
			onSuccess: invalidate,
		}),
		addSubStage: useMutation({
			mutationFn: (vars: {
				stageId: string;
				code: string;
				name: string;
				performerType: "MASTER" | "INSPECTOR";
				wageRatePerSqm: string;
				standardDurationDays: number;
			}) => {
				const { stageId, ...body } = vars;
				return unwrap(api.stages({ stageId })["sub-stages"].post(body));
			},
			onSuccess: invalidate,
		}),
		updateSubStage: useMutation({
			mutationFn: (vars: { id: string; patch: Record<string, unknown> }) =>
				unwrap(api["sub-stages"]({ subStageId: vars.id }).patch(vars.patch)),
			onSuccess: invalidate,
		}),
		deleteSubStage: useMutation({
			mutationFn: (id: string) => unwrap(api["sub-stages"]({ subStageId: id }).delete()),
			onSuccess: invalidate,
		}),
		reorderSubStages: useMutation({
			mutationFn: (vars: { stageId: string; order: { id: string; order: number }[] }) =>
				unwrap(
					api.stages({ stageId: vars.stageId })["sub-stages"].reorder.post({ order: vars.order }),
				),
			onSuccess: invalidate,
		}),
		addChecklistItem: useMutation({
			mutationFn: (vars: { subStageId: string; text: string; criteria?: string | null }) =>
				unwrap(
					api["sub-stages"]({ subStageId: vars.subStageId })["checklist-items"].post({
						text: vars.text,
						criteria: vars.criteria ?? null,
					}),
				),
			onSuccess: invalidate,
		}),
		updateChecklistItem: useMutation({
			mutationFn: (vars: { id: string; patch: { text?: string; criteria?: string | null } }) =>
				unwrap(api["checklist-items"]({ checklistItemId: vars.id }).patch(vars.patch)),
			onSuccess: invalidate,
		}),
		deleteChecklistItem: useMutation({
			mutationFn: (id: string) => unwrap(api["checklist-items"]({ checklistItemId: id }).delete()),
			onSuccess: invalidate,
		}),
		addMediaRequirement: useMutation({
			mutationFn: (vars: {
				subStageId: string;
				mediaType: "PHOTO" | "VIDEO";
				required: boolean;
				description: string;
			}) => {
				const { subStageId, ...body } = vars;
				return unwrap(api["sub-stages"]({ subStageId })["media-requirements"].post(body));
			},
			onSuccess: invalidate,
		}),
		updateMediaRequirement: useMutation({
			mutationFn: (vars: {
				id: string;
				patch: { mediaType?: "PHOTO" | "VIDEO"; required?: boolean; description?: string };
			}) => unwrap(api["media-requirements"]({ mediaRequirementId: vars.id }).patch(vars.patch)),
			onSuccess: invalidate,
		}),
		deleteMediaRequirement: useMutation({
			mutationFn: (id: string) =>
				unwrap(api["media-requirements"]({ mediaRequirementId: id }).delete()),
			onSuccess: invalidate,
		}),
	};
}
