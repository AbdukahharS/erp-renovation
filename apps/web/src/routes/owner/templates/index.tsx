import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTemplatesList } from "@/lib/queries/templates";

export const Route = createFileRoute("/owner/templates/")({
	component: TemplatesIndex,
});

function TemplatesIndex() {
	const { data: templates, isLoading } = useTemplatesList();
	if (isLoading) return <p className="text-sm text-muted-foreground">Loading templates…</p>;
	const first = templates?.[0];
	if (first) {
		return <Navigate to="/owner/templates/$templateId" params={{ templateId: first.id }} />;
	}
	return (
		<p className="text-sm text-muted-foreground">
			No templates yet. Provision a tenant to seed the default.
		</p>
	);
}
