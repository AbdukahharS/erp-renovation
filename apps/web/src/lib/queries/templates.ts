import type { Specialization, Template, TemplateTree } from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "../api";

/**
 * TODO(Phase 9 polish): switch this layer to the Eden Treaty client.
 *
 * Server-side, every templates route now validates against a TypeBox schema
 * derived from the shared Zod schemas via `zodBody()` (see
 * apps/api/src/lib/zod-body.ts), so Eden infers correct body types. Two issues
 * still block the web migration:
 *
 *   1. Eden merges path-param types across routes sharing a path prefix —
 *      `/templates/:id` (PATCH) and `/templates/:templateId/stages` (POST)
 *      both expose `:id`/`:templateId` at the same level, forcing callers to
 *      pass both. Rename route params (or restructure paths) to fix.
 *   2. Response types on success/failure share a union (`{...row} | {error}`).
 *      Eden surfaces the union as `data`. Handlers should throw on failure
 *      (via Elysia's `error()` helper or thrown exceptions) so success types
 *      narrow cleanly.
 *
 * Until then this file talks to the API with fetch + the row types from
 * `@repo/validators`. Server validation already protects payload correctness.
 */

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		...init,
		headers: {
			"content-type": "application/json",
			...(init.headers ?? {}),
		},
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`${res.status} ${text}`);
	}
	return (await res.json()) as T;
}

export const templateKeys = {
	all: ["templates"] as const,
	list: () => [...templateKeys.all, "list"] as const,
	tree: (id: string) => [...templateKeys.all, "tree", id] as const,
	specializations: () => [...templateKeys.all, "specializations"] as const,
};

export function useTemplatesList() {
	return useQuery({
		queryKey: templateKeys.list(),
		queryFn: () => call<Template[]>("/templates"),
	});
}

export function useTemplateTree(id: string | undefined) {
	return useQuery({
		queryKey: id ? templateKeys.tree(id) : ["templates", "tree", "none"],
		queryFn: () => call<TemplateTree>(`/templates/${id}`),
		enabled: !!id,
	});
}

export function useSpecializations() {
	return useQuery({
		queryKey: templateKeys.specializations(),
		queryFn: () => call<Specialization[]>("/specializations"),
	});
}

export function useTemplateMutations(templateId: string | undefined) {
	const qc = useQueryClient();
	const invalidate = () => {
		if (templateId) qc.invalidateQueries({ queryKey: templateKeys.tree(templateId) });
		qc.invalidateQueries({ queryKey: templateKeys.list() });
	};

	return {
		renameTemplate: useMutation({
			mutationFn: (name: string) =>
				call(`/templates/${templateId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
			onSuccess: invalidate,
		}),
		addStage: useMutation({
			mutationFn: (name: string) =>
				call(`/templates/${templateId}/stages`, {
					method: "POST",
					body: JSON.stringify({ name }),
				}),
			onSuccess: invalidate,
		}),
		renameStage: useMutation({
			mutationFn: (vars: { id: string; name: string }) =>
				call(`/stages/${vars.id}`, { method: "PATCH", body: JSON.stringify({ name: vars.name }) }),
			onSuccess: invalidate,
		}),
		deleteStage: useMutation({
			mutationFn: (id: string) => call(`/stages/${id}`, { method: "DELETE" }),
			onSuccess: invalidate,
		}),
		reorderStages: useMutation({
			mutationFn: (order: { id: string; order: number }[]) =>
				call(`/templates/${templateId}/stages/reorder`, {
					method: "POST",
					body: JSON.stringify({ order }),
				}),
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
			}) =>
				call(`/stages/${vars.stageId}/sub-stages`, {
					method: "POST",
					body: JSON.stringify(vars),
				}),
			onSuccess: invalidate,
		}),
		updateSubStage: useMutation({
			mutationFn: (vars: { id: string; patch: Record<string, unknown> }) =>
				call(`/sub-stages/${vars.id}`, {
					method: "PATCH",
					body: JSON.stringify(vars.patch),
				}),
			onSuccess: invalidate,
		}),
		deleteSubStage: useMutation({
			mutationFn: (id: string) => call(`/sub-stages/${id}`, { method: "DELETE" }),
			onSuccess: invalidate,
		}),
		reorderSubStages: useMutation({
			mutationFn: (vars: { stageId: string; order: { id: string; order: number }[] }) =>
				call(`/stages/${vars.stageId}/sub-stages/reorder`, {
					method: "POST",
					body: JSON.stringify({ order: vars.order }),
				}),
			onSuccess: invalidate,
		}),
		addChecklistItem: useMutation({
			mutationFn: (vars: { subStageId: string; text: string; criteria?: string | null }) =>
				call(`/sub-stages/${vars.subStageId}/checklist-items`, {
					method: "POST",
					body: JSON.stringify({ text: vars.text, criteria: vars.criteria ?? null }),
				}),
			onSuccess: invalidate,
		}),
		updateChecklistItem: useMutation({
			mutationFn: (vars: { id: string; patch: { text?: string; criteria?: string | null } }) =>
				call(`/checklist-items/${vars.id}`, {
					method: "PATCH",
					body: JSON.stringify(vars.patch),
				}),
			onSuccess: invalidate,
		}),
		deleteChecklistItem: useMutation({
			mutationFn: (id: string) => call(`/checklist-items/${id}`, { method: "DELETE" }),
			onSuccess: invalidate,
		}),
		addMediaRequirement: useMutation({
			mutationFn: (vars: {
				subStageId: string;
				mediaType: "PHOTO" | "VIDEO";
				required: boolean;
				description: string;
			}) =>
				call(`/sub-stages/${vars.subStageId}/media-requirements`, {
					method: "POST",
					body: JSON.stringify({
						mediaType: vars.mediaType,
						required: vars.required,
						description: vars.description,
					}),
				}),
			onSuccess: invalidate,
		}),
		updateMediaRequirement: useMutation({
			mutationFn: (vars: {
				id: string;
				patch: { mediaType?: "PHOTO" | "VIDEO"; required?: boolean; description?: string };
			}) =>
				call(`/media-requirements/${vars.id}`, {
					method: "PATCH",
					body: JSON.stringify(vars.patch),
				}),
			onSuccess: invalidate,
		}),
		deleteMediaRequirement: useMutation({
			mutationFn: (id: string) => call(`/media-requirements/${id}`, { method: "DELETE" }),
			onSuccess: invalidate,
		}),
	};
}
