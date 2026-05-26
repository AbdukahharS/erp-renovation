import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/properties/new")({
	staticData: { crumbKey: "crumbs.new" },
});
