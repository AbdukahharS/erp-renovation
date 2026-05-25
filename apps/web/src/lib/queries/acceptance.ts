import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "../api";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		...init,
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return (await res.json()) as T;
}

export type MasterAvailableStage = {
	subStageInstanceId: string;
	propertyId: string;
	propertyName: string;
	stageName: string;
	code: string;
	name: string;
	specialization: string | null;
	wageAmount: string;
	standardDurationDays: number;
};
export type MasterMyStage = MasterAvailableStage & {
	status: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "SUBMITTED" | "ACCEPTED" | "REJECTED";
};

export type StageMediaView = {
	id: string;
	assetId: string;
	kind: "FLOOR_PLAN" | "BEFORE_PHOTO" | "STAGE_PHOTO" | "DEFECT_PHOTO";
	contentType: string;
	r2Key: string;
	uploadedBy: string;
	uploadedAt: string;
	url: string | null;
};

export type StageDetail = {
	subStage: {
		id: string;
		stageInstanceId: string;
		order: number;
		code: string;
		name: string;
		performerType: "MASTER" | "INSPECTOR";
		specialization: string | null;
		standardDurationDays: number;
		wageAmount: string;
		description: string | null;
		status: MasterMyStage["status"];
		checklistItems: Array<{
			id: string;
			subStageInstanceId: string;
			order: number;
			text: string;
			criteria: string | null;
		}>;
		mediaRequirements: Array<{
			id: string;
			subStageInstanceId: string;
			mediaType: "PHOTO" | "VIDEO";
			required: boolean;
			description: string;
		}>;
	};
	stageName: string;
	property: { id: string; name: string; status: string; materialsOnSite: boolean };
	assignment: { masterUserId: string; claimedAt: string } | null;
	activeRequest: { id: string; submittedBy: string; submittedAt: string } | null;
	media: StageMediaView[];
	previousResults: Array<{
		checklistItemInstanceId: string;
		passed: boolean;
		note?: string | null;
	}>;
};

export type InspectorQueue = {
	submitted: Array<{
		subStageInstanceId: string;
		propertyId: string;
		propertyName: string;
		stageName: string;
		code: string;
		name: string;
		performerType: "MASTER" | "INSPECTOR";
		status: MasterMyStage["status"];
		acceptanceRequestId: string;
		submittedBy: string;
		submittedAt: string;
	}>;
	direct: Array<{
		subStageInstanceId: string;
		propertyId: string;
		propertyName: string;
		stageName: string;
		code: string;
		name: string;
		performerType: "INSPECTOR";
		status: "AVAILABLE";
	}>;
};

export const acceptanceKeys = {
	masterAvailable: ["master", "available"] as const,
	masterMy: ["master", "my"] as const,
	stage: (id: string) => ["stage", id] as const,
	inspectorQueue: ["inspector", "queue"] as const,
};

// --------- Master ---------

export function useAvailableStages() {
	return useQuery({
		queryKey: acceptanceKeys.masterAvailable,
		queryFn: () => call<MasterAvailableStage[]>("/master/available-stages"),
	});
}

export function useMyStages() {
	return useQuery({
		queryKey: acceptanceKeys.masterMy,
		queryFn: () => call<MasterMyStage[]>("/master/my-stages"),
	});
}

export function useStageDetail(scope: "master" | "inspector", id: string | undefined) {
	return useQuery({
		queryKey: id ? acceptanceKeys.stage(id) : ["stage", "none"],
		queryFn: () => call<StageDetail>(`/${scope}/stages/${id}`),
		enabled: !!id,
	});
}

export function useTakeStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => call<{ ok: true }>(`/master/stages/${id}/take`, { method: "POST" }),
		onSuccess: (_, id) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.masterAvailable });
			qc.invalidateQueries({ queryKey: acceptanceKeys.masterMy });
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(id) });
		},
	});
}

export type PresignResponse = {
	assetId: string;
	uploadUrl: string;
	key: string;
	expiresInSeconds: number;
	bucket?: string;
};

export function usePresignStageMedia(stageId: string | undefined) {
	return useMutation({
		mutationFn: (vars: { mediaType: "PHOTO" | "VIDEO"; contentType: string }) =>
			call<PresignResponse>(`/master/stages/${stageId}/media/presign`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
	});
}

export function useAttachStageMedia(stageId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (assetId: string) =>
			call<{ ok: true; assetId: string }>(`/master/stages/${stageId}/media/attach`, {
				method: "POST",
				body: JSON.stringify({ assetId }),
			}),
		onSuccess: () => {
			if (stageId) qc.invalidateQueries({ queryKey: acceptanceKeys.stage(stageId) });
		},
	});
}

export function useSubmitStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			call<{ ok: true }>(`/master/stages/${id}/submit`, {
				method: "POST",
				body: JSON.stringify({}),
			}),
		onSuccess: (_, id) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.masterMy });
			qc.invalidateQueries({ queryKey: acceptanceKeys.inspectorQueue });
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(id) });
		},
	});
}

/**
 * Upload a File to a presigned URL via direct PUT. Used by both master and
 * inspector flows. Throws on non-2xx.
 */
export async function uploadToPresignedUrl(url: string, file: File): Promise<void> {
	const res = await fetch(url, {
		method: "PUT",
		body: file,
		headers: { "Content-Type": file.type },
	});
	if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
}

// --------- Inspector ---------

export function useInspectorQueue() {
	return useQuery({
		queryKey: acceptanceKeys.inspectorQueue,
		queryFn: () => call<InspectorQueue>("/inspector/queue"),
	});
}

export function usePresignInspectorMedia(stageId: string | undefined) {
	return useMutation({
		mutationFn: (vars: { kind: "BEFORE_PHOTO" | "DEFECT_PHOTO"; contentType: string }) =>
			call<PresignResponse>(`/inspector/stages/${stageId}/media/presign`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
	});
}

export function useAttachInspectorMedia(stageId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { assetId: string; kind: "BEFORE_PHOTO" | "DEFECT_PHOTO" }) =>
			call<{ ok: true; assetId: string }>(`/inspector/stages/${stageId}/media/attach`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
		onSuccess: () => {
			if (stageId) qc.invalidateQueries({ queryKey: acceptanceKeys.stage(stageId) });
		},
	});
}

export function useSubmitSelfStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { id: string; materialsOnSite?: boolean }) =>
			call<{ ok: true }>(`/inspector/stages/${vars.id}/submit-self`, {
				method: "POST",
				body: JSON.stringify({ materialsOnSite: vars.materialsOnSite }),
			}),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.inspectorQueue });
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(vars.id) });
		},
	});
}

export function useAcceptStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: {
			id: string;
			results: Array<{ checklistItemInstanceId: string; passed: boolean; note?: string | null }>;
		}) =>
			call<{ ok: true }>(`/inspector/stages/${vars.id}/accept`, {
				method: "POST",
				body: JSON.stringify({ results: vars.results }),
			}),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.inspectorQueue });
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(vars.id) });
			qc.invalidateQueries({ queryKey: ["properties"] });
		},
	});
}

export function useRejectStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { id: string; comment: string; defectAssetId?: string | null }) =>
			call<{ ok: true }>(`/inspector/stages/${vars.id}/reject`, {
				method: "POST",
				body: JSON.stringify({ comment: vars.comment, defectAssetId: vars.defectAssetId ?? null }),
			}),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.inspectorQueue });
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(vars.id) });
		},
	});
}

export function useManualOverride() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: {
			id: string;
			action: "BLOCK" | "UNBLOCK" | "FORCE_UNBLOCK";
			reason: string;
		}) =>
			call<{ ok: true }>(`/inspector/stages/${vars.id}/manual-override`, {
				method: "POST",
				body: JSON.stringify({ action: vars.action, reason: vars.reason }),
			}),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(vars.id) });
			qc.invalidateQueries({ queryKey: ["properties"] });
		},
	});
}
