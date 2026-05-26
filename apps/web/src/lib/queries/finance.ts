import type {
	FinancialTransaction,
	MasterFinanceView,
	PayoutSettlementRow,
	PropertyCostCategory,
	PropertyCostRow,
	PropertyFinanceSummary,
} from "@repo/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

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
		queryFn: () =>
			unwrap(
				api.owner.properties({ propertyId: propertyId as string }).finance.get(),
			) as unknown as Promise<PropertyFinancePayload>,
		enabled: !!propertyId,
	});
}

export function useAllPropertiesFinance() {
	return useQuery({
		queryKey: financeKeys.list(),
		queryFn: () => unwrap(api.owner.finance.get()) as unknown as Promise<PropertyFinanceSummary[]>,
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
			unwrap(api.owner.properties({ propertyId: propertyId as string }).costs.post(vars)),
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
			unwrap(
				api.owner
					.properties({ propertyId: propertyId as string })
					.costs({ costId })
					.delete(),
			),
		onSuccess: () => {
			if (propertyId) qc.invalidateQueries({ queryKey: financeKeys.property(propertyId) });
		},
	});
}

export type CloseUnitVars = {
	materialsHandoverChecked: true;
	clientHandoverChecked: true;
	portfolioAssetIds: string[];
	notes?: string;
};

export function useCloseProperty(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: CloseUnitVars) =>
			unwrap(api.owner.properties({ propertyId: propertyId as string }).close.post(vars)),
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
			unwrap(
				api.owner
					.properties({ propertyId: propertyId as string })
					.portfolio.presign.post({ kind: "PORTFOLIO_PHOTO", contentType }),
			),
	});
}

export function useReopenProperty(propertyId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			unwrap(api.owner.properties({ propertyId: propertyId as string }).reopen.post({})),
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
		queryFn: () =>
			unwrap(
				api.owner["master-finance"]({ masterUserId: masterUserId as string }).get(),
			) as unknown as Promise<MasterFinancePayload>,
		enabled: !!masterUserId,
	});
}

export function useSelfMasterFinance() {
	return useQuery({
		queryKey: financeKeys.masterSelf(),
		queryFn: () => unwrap(api.master.finance.get()) as unknown as Promise<MasterFinanceView>,
	});
}

export function useMarkPayout(masterUserId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { amount: string; note?: string }) =>
			unwrap(
				api.owner["master-finance"]({ masterUserId: masterUserId as string }).payouts.post(vars),
			),
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
		queryFn: () =>
			unwrap(
				api.inspector.stages({ subStageId: subStageId as string })["latest-rejection"].get(),
			) as unknown as Promise<LatestRejection | null>,
		enabled: !!subStageId,
	});
}

export function useApplyFine(rejectionId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { amount: string; reason: string }) =>
			unwrap(api.inspector.rejections({ rejectionId: rejectionId as string }).fine.post(vars)),
		onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
	});
}

export function useGrantClosingPermission(userId: string | undefined) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (closingPermission: boolean) =>
			unwrap(
				api.owner
					.memberships({ userId: userId as string })
					["closing-permission"].post({ closingPermission }),
			),
		onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
	});
}
