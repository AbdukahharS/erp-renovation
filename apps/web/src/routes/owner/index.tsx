import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/")({
	component: OwnerHome,
});

function OwnerHome() {
	return (
		<section className="space-y-4">
			<h1 className="text-2xl font-semibold">Owner dashboard</h1>
			<p className="text-sm text-muted-foreground">Properties, templates and finance live here.</p>
			<ul className="space-y-1 text-sm">
				<li>
					<Link to="/owner/properties" className="underline">
						Properties
					</Link>
				</li>
				<li>
					<Link to="/owner/templates" className="underline">
						Templates
					</Link>
				</li>
				<li>
					<Link to="/owner/masters" className="underline">
						Masters
					</Link>
				</li>
			</ul>
		</section>
	);
}
