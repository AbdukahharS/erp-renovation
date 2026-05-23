import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/procurement/")({
	component: () => (
		<section>
			<h1 className="text-xl font-semibold">Procurement (stub)</h1>
			<p className="text-sm text-muted-foreground">
				Role exists from Phase 1; UI deferred per assumption A1.
			</p>
		</section>
	),
});
