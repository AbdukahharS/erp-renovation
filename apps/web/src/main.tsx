import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./lib/i18n";
import { DefaultError, DefaultPending } from "./components/route-boundaries";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();
const router = createRouter({
	routeTree,
	context: { me: null, queryClient },
	defaultPreload: "intent",
	defaultPendingComponent: DefaultPending,
	defaultErrorComponent: DefaultError,
	defaultPendingMs: 200,
	defaultPendingMinMs: 500,
});

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
