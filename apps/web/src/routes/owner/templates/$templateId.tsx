import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/templates/$templateId")({
	staticData: { crumbKey: "crumbs.template" },
});
