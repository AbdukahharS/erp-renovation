import type {
	FinancialTransaction,
	MasterFinanceView,
	PayoutSettlementRow,
	PropertyCostCategory,
	PropertyCostRow,
	PropertyFinanceSummary,
} from "@repo/validators";
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

export const financeKeys = {
	all: ["finance"] as const,
	property: (id: string) => [...financeKeys.all, "property", id] as const,
	list: () => [...financeKeys.all, "list"] as const,
	master: (id: string) => [...financeKeys.all, "master", id] as const,
	masterSelf: () => [...financeKeys.all, "master-self"] as const,
};

export type PropertyFinancePayload = {
	summary: PropertyFinanceSummary;
	costs: PropertyCostRow[];
};

export function usePropertyFinance(propertyId: string | undefined) {
	return useQuery({
		queryKey: propertyId ? financeKeys.property(propertyId) : [...financeKeys.all, "noop"],
		queryFn: () => call<PropertyFinancePayload>(`/owner/properties/${propertyId}/finance`),
		enabled: !!propertyId,
	});
}

export function useAllPropertiesFinance() {
	return useQuery({
		queryKey: financeKeys.list(),
		queryFn: () => call<PropertyFinanceSummary[]>("/owner/finance"),
	});
}

export type AddCostVars = {
	category: PropertyCostCategory;
	amount: string;
	description?: string;
};

export function useAddPropertyCost(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: AddCostVars) =>
			call<{ costId: string; transactionId: string }>(`/owner/properties/${propertyId}/costs`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
			qc.invalidateQueries({ queryKey: financeKeys.list() });
		},
	});
}

export function useReverseCost(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (costId: string) =>
			call<{ ok: true }>(`/owner/properties/${propertyId}/costs/${costId}`, {
				method: "DELETE",
			}),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
		},
	});
}

export type CloseUnitVars = {
	materialsHandoverChecked: boolean;
	clientHandoverChecked: boolean;
	notes?: string;
	portfolioAssetIds?: string[];
};

export function useCloseProperty(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: CloseUnitVars) =>
			call<{
				id: string;
				certificateAssetId: string | null;
				finalReportAssetId: string | null;
			}>(`/owner/properties/${propertyId}/close`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
		onSuccess: () => {
			if (propertyId) {
				qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
				qc.invalidateQueries({ queryKey: ["properties"] });
			}
			qc.invalidateQueries({ queryKey: financeKeys.list() });
		},
	});
}

export type PortfolioPresignResponse = {
	assetId: string;
	uploadUrl: string;
	key: string;
	expiresInSeconds: number;
};

export function usePresignPortfolio(propertyId: string | undefined) {
	return useMutation({
		mutationFn: (contentType: string) =>
			call<PortfolioPresignResponse>(`/owner/properties/${propertyId}/portfolio/presign`, {
				method: "POST",
				body: JSON.stringify({ kind: "PORTFOLIO_PHOTO", contentType }),
			}),
	});
}

export function useReopenProperty(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			call<{ ok: true }>(`/owner/properties/${propertyId}/reopen`, { method: "POST" }),
		onSuccess: () => {
			if (propertyId) {
				qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
				qc.invalidateQueries({ queryKey: ["properties"] });
			}
		},
	});
}

export type MasterFinancePayload = {
	masterUserId: string;
	balance: string;
	wagesCredited: string;
	finesDeducted: string;
	payoutsSettled: string;
	transactions: FinancialTransaction[];
	settlements: PayoutSettlementRow[];
};

export function useMasterFinance(masterUserId: string | undefined) {
	return useQuery({
		queryKey: masterUserId ? financeKeys.master(masterUserId) : [...financeKeys.all, "noop"],
		queryFn: () => call<MasterFinancePayload>(`/owner/masters/${masterUserId}/finance`),
		enabled: !!masterUserId,
	});
}

export function useSelfMasterFinance() {
	return useQuery({
		queryKey: financeKeys.masterSelf(),
		queryFn: () => call<MasterFinanceView>("/master/finance"),
	});
}

export function useMarkPayout(masterUserId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { amount: string; note?: string }) =>
			call<{ settlementId: string }>(`/owner/masters/${masterUserId}/payouts`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
		onSuccess: () => {
			if (masterUserId) qc.invalidateQueries({ queryKey: financeKeys.master(masterUserId) });
		},
	});
}

export type LatestRejection = {
	id: string;
	comment: string;
	rejectedAt: string;
	fined: boolean;
};

export function useLatestRejection(subStageId: string | undefined) {
	return useQuery({
		queryKey: subStageId
			? [...financeKeys.all, "latest-rejection", subStageId]
			: [...financeKeys.all, "noop"],
		queryFn: () => call<LatestRejection | null>(`/inspector/stages/${subStageId}/latest-rejection`),
		enabled: !!subStageId,
	});
}

export function useApplyFine(rejectionId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { amount: string; reason: string }) =>
			call<{ fineId: string }>(`/inspector/rejections/${rejectionId}/fine`, {
				method: "POST",
				body: JSON.stringify(vars),
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
	});
}

export function useGrantClosingPermission(userId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (closingPermission: boolean) =>
			call<{ ok: true; closingPermission: boolean }>(
				`/owner/memberships/${userId}/closing-permission`,
				{ method: "POST", body: JSON.stringify({ closingPermission }) },
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
	});
}
