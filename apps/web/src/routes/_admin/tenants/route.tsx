import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin/tenants")({
	staticData: { crumbKey: "nav.tenants" },
	component: TenantsShell,
});

function TenantsShell() {
	return <Outlet />;
}
