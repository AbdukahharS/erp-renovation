import type { PropertyAssetRow, PropertyListItem, PropertyTree } from "@repo/validators";
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
