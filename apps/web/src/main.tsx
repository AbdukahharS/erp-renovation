import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { startRealtime } from "./lib/realtime";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
	routeTree,
	context: { me: null },
	defaultPreload: "intent",
});
const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root element missing");

createRoot(rootEl).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);

// Phase 8: kick off the realtime socket once the app mounts. Tenant scoping
// is enforced at the server's handshake; the client only sees its tenant's
// events. Falls back gracefully when the API is unreachable.
startRealtime(queryClient);
