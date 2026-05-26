import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/properties")({
	staticData: { crumb: "Properties" },
	component: PropertiesShell,
});

function PropertiesShell() {
	return <Outlet />;
}
