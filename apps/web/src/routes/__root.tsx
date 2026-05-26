import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { DefaultError, DefaultPending } from "@/components/route-boundaries";
import { fetchMe, type SessionMe } from "@/lib/auth";

export interface RouterContext {
	me: SessionMe | null;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		const me = await context.queryClient.ensureQueryData({
			queryKey: ["me"],
			queryFn: fetchMe,
			staleTime: Number.POSITIVE_INFINITY,
		});
		return { me };
	},
	component: () => <Outlet />,
	pendingComponent: DefaultPending,
	errorComponent: DefaultError,
});
