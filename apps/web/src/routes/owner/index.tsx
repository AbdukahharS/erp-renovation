import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/")({
	component: OwnerHome,
});

function OwnerHome() {
	return (
		<section className="space-y-2">
			<h1 className="text-2xl font-semibold">Owner dashboard</h1>
			<p className="text-sm text-muted-foreground">
				Properties, templates and finance live here. Phase 2 onward fills this in.
			</p>
		</section>
	);
}
