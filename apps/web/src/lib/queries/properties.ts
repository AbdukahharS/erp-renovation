import type { PropertyAssetRow, PropertyListItem, PropertyTree } from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "../api";

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

export const propertyKeys = {
	all: ["properties"] as const,
	list: () => [...propertyKeys.all, "list"] as const,
	detail: (id: string) => [...propertyKeys.all, "detail", id] as const,
};

export function useProperties() {
	return useQuery({
		queryKey: propertyKeys.list(),
		queryFn: () => call<PropertyListItem[]>("/properties"),
	});
}

export function useProperty(id: string | undefined) {
	return useQuery({
		queryKey: id ? propertyKeys.detail(id) : ["properties", "detail", "none"],
		queryFn: () => call<PropertyTree>(`/properties/${id}`),
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
		mutationFn: (vars: CreatePropertyVars) =>
			call<{ id: string }>("/properties", {
				method: "POST",
				body: JSON.stringify(vars),
			}),
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
			call<PresignResponse>(`/properties/${propertyId}/floor-plan/presign`, {
				method: "POST",
				body: JSON.stringify({ kind: "FLOOR_PLAN", contentType }),
			}),
	});
}

export function useAttachFloorPlan(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (assetId: string) =>
			call<{ asset: PropertyAssetRow }>(`/properties/${propertyId}/floor-plan/attach`, {
				method: "POST",
				body: JSON.stringify({ assetId }),
			}),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: propertyKeys.detail(propertyId) });
		},
	});
}
