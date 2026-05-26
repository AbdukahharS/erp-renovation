import { createLazyFileRoute } from "@tanstack/react-router";
import { InspectorStageReview } from "@/features/acceptance/inspector-stage-review";

export const Route = createLazyFileRoute("/inspector/stages/$subStageId")({
	component: InspectorStageReviewRoute,
});

function InspectorStageReviewRoute() {
	const { subStageId } = Route.useParams();
	return <InspectorStageReview subStageId={subStageId} />;
}
