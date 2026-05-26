import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/masters/$id")({
	staticData: { crumbKey: "crumbs.masterDetail" },
});
