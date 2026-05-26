import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTemplatesList } from "@/lib/queries/templates";

export const Route = createFileRoute("/owner/templates")({
	staticData: { crumb: "Templates" },
	component: TemplatesShell,
});

function TemplatesShell() {
	const { data: templates, isLoading } = useTemplatesList();
	return (
		<div className="grid grid-cols-[220px_1fr] gap-6">
			<aside className="space-y-2">
				<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
					Templates
				</h2>
				{isLoading && <p className="text-xs text-muted-foreground">loading…</p>}
				<ul className="space-y-1">
					{(templates ?? []).map((t) => (
						<li key={t.id}>
							<Link
								to="/owner/templates/$templateId"
								params={{ templateId: t.id }}
								className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted [&.active]:bg-muted [&.active]:font-medium"
								activeProps={{ className: "active" }}
							>
								{t.name}
								{t.isDefault && (
									<span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
										default
									</span>
								)}
							</Link>
						</li>
					))}
				</ul>
			</aside>
			<section>
				<Outlet />
			</section>
		</div>
	);
}
