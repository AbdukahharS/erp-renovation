import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/lib/api";

type TenantConfig = {
	tenantId: string;
	currencyCode: string;
	targetUnitCost: string | null;
};

export function useTenantConfig() {
	return useQuery({
		queryKey: ["tenant-config"],
		queryFn: () => unwrap(api.tenant.config.get()) as Promise<TenantConfig>,
		staleTime: 5 * 60_000,
	});
}

export function useCurrencyCode(): string {
	const { data } = useTenantConfig();
	return data?.currencyCode ?? "USD";
}
