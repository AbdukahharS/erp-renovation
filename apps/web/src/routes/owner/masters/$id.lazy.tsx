import { createLazyFileRoute } from "@tanstack/react-router";
import { MasterDetail } from "@/features/masters/master-detail";

export const Route = createLazyFileRoute("/owner/masters/$id")({
	component: MasterDetailRoute,
});

function MasterDetailRoute() {
	const { id } = Route.useParams();
	return <MasterDetail id={id} />;
}
