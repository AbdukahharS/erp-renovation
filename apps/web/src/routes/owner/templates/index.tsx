import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useTemplatesList } from "@/lib/queries/templates";

export const Route = createFileRoute("/owner/templates/")({
	component: TemplatesIndex,
});

function TemplatesIndex() {
	const { t } = useTranslation();
	const { data: templates, isLoading } = useTemplatesList();
	if (isLoading)
		return <p className="text-sm text-muted-foreground">{t("templates.loadingList")}</p>;
	const first = templates?.[0];
	if (first) {
		return <Navigate to="/owner/templates/$templateId" params={{ templateId: first.id }} />;
	}
	return (
		<div className="rounded-lg border border-dashed p-8 text-center">
			<h3 className="text-base font-semibold">{t("templates.emptyTitle")}</h3>
			<p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				{t("templates.emptyDesc")}
			</p>
		</div>
	);
}
