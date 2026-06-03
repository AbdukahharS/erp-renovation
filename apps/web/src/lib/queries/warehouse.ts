import type {
	AdjustMaterialInput,
	CreateMaterialInput,
	IssueMaterialsInput,
	MaterialMovementRow,
	MaterialWithStock,
	RestockMaterialInput,
	UpdateMaterialInput,
} from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";
import { financeKeys } from "./finance";

export const warehouseKeys = {
	all: ["warehouse"] as const,
	materials: () => [...warehouseKeys.all, "materials"] as const,
	material: (id: string) => [...warehouseKeys.all, "material", id] as const,
	movements: (id: string) => [...warehouseKeys.all, "movements", id] as const,
	issuancesByProperty: (pid: string) =>
		[...warehouseKeys.all, "issuances-by-property", pid] as const,
};

export type PropertyIssuanceRow = {
	id: string;
	propertyId: string;
	materialId: string;
	materialName: string;
	materialUnit: string;
	quantity: string;
	unitPriceSnapshot: string;
	amount: string;
	transactionId: string;
	movementId: string;
	issuedBy: string;
	note: string | null;
	reversedAt: string | null;
	reversedBy: string | null;
	createdAt: string;
};

export function useMaterials() {
	return useQuery({
		queryKey: warehouseKeys.materials(),
		queryFn: () =>
			unwrap(api.owner.warehouse.materials.get()) as unknown as Promise<MaterialWithStock[]>,
	});
}

export function useMaterial(id: string | undefined) {
	return useQuery({
		queryKey: id ? warehouseKeys.material(id) : [...warehouseKeys.all, "noop"],
		queryFn: () =>
			unwrap(
				api.owner.warehouse.materials({ id: id as string }).get(),
			) as unknown as Promise<MaterialWithStock>,
		enabled: !!id,
	});
}

export function useMaterialMovements(id: string | undefined) {
	return useQuery({
		queryKey: id ? warehouseKeys.movements(id) : [...warehouseKeys.all, "noop"],
		queryFn: () =>
			unwrap(
				api.owner.warehouse.materials({ id: id as string }).movements.get(),
			) as unknown as Promise<MaterialMovementRow[]>,
		enabled: !!id,
	});
}

export function usePropertyIssuances(propertyId: string | undefined) {
	return useQuery({
		queryKey: propertyId
			? warehouseKeys.issuancesByProperty(propertyId)
			: [...warehouseKeys.all, "noop"],
		queryFn: () =>
			unwrap(
				api.owner.warehouse.issuances.get({ query: { propertyId: propertyId as string } }),
			) as unknown as Promise<PropertyIssuanceRow[]>,
		enabled: !!propertyId,
	});
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({ queryKey: warehouseKeys.all });
}

export function useCreateMaterial() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: CreateMaterialInput) => unwrap(api.owner.warehouse.materials.post(vars)),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useUpdateMaterial(id: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: UpdateMaterialInput) =>
			unwrap(api.owner.warehouse.materials({ id: id as string }).patch(vars)),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useArchiveMaterial() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => unwrap(api.owner.warehouse.materials({ id }).delete()),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useRestockMaterial(id: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: RestockMaterialInput) =>
			unwrap(api.owner.warehouse.materials({ id: id as string }).restock.post(vars)),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useAdjustMaterial(id: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: AdjustMaterialInput) =>
			unwrap(api.owner.warehouse.materials({ id: id as string }).adjust.post(vars)),
		onSuccess: () => invalidateAll(qc),
	});
}

export function useIssueMaterials(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: IssueMaterialsInput) => unwrap(api.owner.warehouse.issuances.post(vars)),
		onSuccess: () => {
			invalidateAll(qc);
			if (propertyId) {
				qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
				qc.invalidateQueries({ queryKey: warehouseKeys.issuancesByProperty(propertyId) });
			}
			qc.invalidateQueries({ queryKey: financeKeys.list() });
		},
	});
}

export function useReverseIssuance(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (issuanceId: string) =>
			unwrap(api.owner.warehouse.issuances({ id: issuanceId }).reverse.post({})),
		onSuccess: () => {
			invalidateAll(qc);
			if (propertyId) {
				qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
				qc.invalidateQueries({ queryKey: warehouseKeys.issuancesByProperty(propertyId) });
			}
			qc.invalidateQueries({ queryKey: financeKeys.list() });
		},
	});
}
