import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/properties")({
	component: PropertiesShell,
});

function PropertiesShell() {
	return <Outlet />;
}
