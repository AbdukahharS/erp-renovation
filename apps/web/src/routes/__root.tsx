import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { DefaultError, DefaultPending } from "@/components/route-boundaries";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { fetchMe, type SessionMe } from "@/lib/auth";
import { startRealtime, stopRealtime } from "@/lib/realtime";

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
	component: RootComponent,
	pendingComponent: DefaultPending,
	errorComponent: DefaultError,
});

function RootComponent() {
	const { me, queryClient } = Route.useRouteContext();
	const authed = !!me?.user && !!me.activeTenantId;
	useEffect(() => {
		if (!authed) return;
		startRealtime(queryClient);
		return () => stopRealtime();
	}, [authed, queryClient]);

	return (
		<ThemeProvider>
			<Outlet />
			<Toaster position="top-right" richColors />
		</ThemeProvider>
	);
}
