import { createLazyFileRoute } from "@tanstack/react-router";
import { NewPropertyWizard } from "@/features/properties/new-property-wizard";

export const Route = createLazyFileRoute("/owner/properties/new")({
	component: NewPropertyWizard,
});
