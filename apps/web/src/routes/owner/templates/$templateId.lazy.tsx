import { createLazyFileRoute } from "@tanstack/react-router";
import { TemplateEditor } from "@/features/templates/template-editor";

export const Route = createLazyFileRoute("/owner/templates/$templateId")({
	component: TemplateEditorRoute,
});

function TemplateEditorRoute() {
	const { templateId } = Route.useParams();
	return <TemplateEditor templateId={templateId} />;
}
