import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

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
		queryFn: () =>
			unwrap(api.master["available-stages"].get()) as unknown as Promise<MasterAvailableStage[]>,
	});
}

export function useMyStages() {
	return useQuery({
		queryKey: acceptanceKeys.masterMy,
		queryFn: () => unwrap(api.master["my-stages"].get()) as unknown as Promise<MasterMyStage[]>,
	});
}

export function useStageDetail(scope: "master" | "inspector", id: string | undefined) {
	return useQuery({
		queryKey: id ? acceptanceKeys.stage(id) : ["stage", "none"],
		queryFn: () => {
			const stageId = id as string;
			const endpoint =
				scope === "master"
					? api.master.stages({ subStageId: stageId })
					: api.inspector.stages({ subStageId: stageId });
			return unwrap(endpoint.get()) as unknown as Promise<StageDetail>;
		},
		enabled: !!id,
	});
}

export function useTakeStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => unwrap(api.master.stages({ subStageId: id }).take.post({})),
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
			unwrap(
				api.master.stages({ subStageId: stageId as string }).media.presign.post(vars),
			) as unknown as Promise<PresignResponse>,
	});
}

export function useAttachStageMedia(stageId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (assetId: string) =>
			unwrap(api.master.stages({ subStageId: stageId as string }).media.attach.post({ assetId })),
		onSuccess: () => {
			if (stageId) qc.invalidateQueries({ queryKey: acceptanceKeys.stage(stageId) });
		},
	});
}

export function useSubmitStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => unwrap(api.master.stages({ subStageId: id }).submit.post({})),
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
		queryFn: () => unwrap(api.inspector.queue.get()) as unknown as Promise<InspectorQueue>,
	});
}

export function usePresignInspectorMedia(stageId: string | undefined) {
	return useMutation({
		mutationFn: (vars: { kind: "BEFORE_PHOTO" | "DEFECT_PHOTO"; contentType: string }) =>
			unwrap(
				api.inspector.stages({ subStageId: stageId as string }).media.presign.post(vars),
			) as unknown as Promise<PresignResponse>,
	});
}

export function useAttachInspectorMedia(stageId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { assetId: string; kind: "BEFORE_PHOTO" | "DEFECT_PHOTO" }) =>
			unwrap(api.inspector.stages({ subStageId: stageId as string }).media.attach.post(vars)),
		onSuccess: () => {
			if (stageId) qc.invalidateQueries({ queryKey: acceptanceKeys.stage(stageId) });
		},
	});
}

export function useSubmitSelfStage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { id: string; materialsOnSite?: boolean }) =>
			unwrap(
				api.inspector
					.stages({ subStageId: vars.id })
					["submit-self"].post({ materialsOnSite: vars.materialsOnSite }),
			),
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
			unwrap(api.inspector.stages({ subStageId: vars.id }).accept.post({ results: vars.results })),
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
			unwrap(
				api.inspector.stages({ subStageId: vars.id }).reject.post({
					comment: vars.comment,
					defectAssetId: vars.defectAssetId ?? null,
				}),
			),
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
			unwrap(
				api.inspector
					.stages({ subStageId: vars.id })
					["manual-override"].post({ action: vars.action, reason: vars.reason }),
			),
		onSuccess: (_, vars) => {
			qc.invalidateQueries({ queryKey: acceptanceKeys.stage(vars.id) });
			qc.invalidateQueries({ queryKey: ["properties"] });
		},
	});
}
