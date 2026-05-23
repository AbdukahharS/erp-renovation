import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { fetchMe, type SessionMe } from "@/lib/auth";

export interface RouterContext {
	me: SessionMe | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async () => ({ me: await fetchMe() }),
	component: () => <Outlet />,
});
