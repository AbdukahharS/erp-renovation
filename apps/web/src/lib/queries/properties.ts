import type {
	PropertyAssetRow,
	PropertyListItem,
	PropertyTree,
	TemplateSnapshotInputType,
} from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

export const propertyKeys = {
	all: ["properties"] as const,
	list: () => [...propertyKeys.all, "list"] as const,
	detail: (id: string) => [...propertyKeys.all, "detail", id] as const,
};

// Eden infers `Date` for Drizzle timestamp columns even though the wire
// format is an ISO string; validators model the wire shape correctly. The
// `as unknown as Promise<…>` casts below bridge that single divergence;
// the rest of the call site remains fully Eden-typed.

export function useProperties() {
	return useQuery({
		queryKey: propertyKeys.list(),
		queryFn: () => unwrap(api.properties.get()) as unknown as Promise<PropertyListItem[]>,
	});
}

export function useProperty(id: string | undefined) {
	return useQuery({
		queryKey: id ? propertyKeys.detail(id) : ["properties", "detail", "none"],
		queryFn: () =>
			unwrap(
				api.properties({ propertyId: id as string }).get(),
			) as unknown as Promise<PropertyTree>,
		enabled: !!id,
	});
}

export type CreatePropertyVars = {
	name: string;
	address: string;
	layoutType: "NEW_BUILD" | "SECONDARY";
	areaSqm: string;
	plannedUnitCost: string;
	deadlineAt?: string | null;
	templateId: string;
	editedSnapshot?: TemplateSnapshotInputType;
};

export function useCreateProperty() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: CreatePropertyVars) => unwrap(api.properties.post(vars)),
		onSuccess: () => qc.invalidateQueries({ queryKey: propertyKeys.list() }),
	});
}

export type PresignResponse = {
	assetId: string;
	uploadUrl: string;
	key: string;
	expiresInSeconds: number;
};

export function usePresignFloorPlan(propertyId: string | undefined) {
	return useMutation({
		mutationFn: (contentType: string) =>
			unwrap(
				api
					.properties({ propertyId: propertyId as string })
					["floor-plan"].presign.post({ kind: "FLOOR_PLAN", contentType }),
			),
	});
}

export type ArchiveBlocker = { code: string; name: string };

// Custom error so the UI can surface the blocking sub-stages list when the
// API rejects archive with 409 active_work. Eden's error.value carries
// `{ error: "active_work", blockers: [...] }` on that path.
export class ArchiveActiveWorkError extends Error {
	blockers: ArchiveBlocker[];
	constructor(blockers: ArchiveBlocker[]) {
		super("active_work");
		this.name = "ArchiveActiveWorkError";
		this.blockers = blockers;
	}
}

export function useArchiveProperty(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (reason: string) => {
			const res = await api
				.properties({ propertyId: propertyId as string })
				.archive.post({ reason });
			if (res.error) {
				const value = res.error.value as
					| { error?: string; blockers?: ArchiveBlocker[] }
					| string
					| undefined;
				if (
					value &&
					typeof value === "object" &&
					value.error === "active_work" &&
					Array.isArray(value.blockers)
				) {
					throw new ArchiveActiveWorkError(value.blockers);
				}
				const msg =
					typeof value === "string"
						? value
						: value && typeof value === "object" && typeof value.error === "string"
							? value.error
							: String(res.error.status);
				throw new Error(msg);
			}
			return res.data;
		},
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) });
			qc.invalidateQueries({ queryKey: propertyKeys.list() });
		},
	});
}

export function useUnarchiveProperty(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => unwrap(api.properties({ propertyId: propertyId as string }).unarchive.post()),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) });
			qc.invalidateQueries({ queryKey: propertyKeys.list() });
		},
	});
}

export function useAttachFloorPlan(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (assetId: string) =>
			unwrap(
				api.properties({ propertyId: propertyId as string })["floor-plan"].attach.post({ assetId }),
			) as unknown as Promise<{ asset: PropertyAssetRow }>,
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) });
		},
	});
}
