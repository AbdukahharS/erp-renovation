import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/procurement/")({
	component: ProcurementStub,
});

function ProcurementStub() {
	const { t } = useTranslation();
	return (
		<section>
			<h1 className="text-xl font-semibold">{t("procurement.title")}</h1>
			<p className="text-sm text-muted-foreground">{t("procurement.description")}</p>
		</section>
	);
}
