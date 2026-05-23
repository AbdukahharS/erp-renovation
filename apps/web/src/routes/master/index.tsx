import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/master/")({
	component: () => (
		<section>
			<h1 className="text-xl font-semibold">Your current task</h1>
			<p className="text-sm text-muted-foreground">Wired up in Phase 4.</p>
		</section>
	),
});
