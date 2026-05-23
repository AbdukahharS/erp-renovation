import { createFileRoute, Link } from "@tanstack/react-router";
import { useProperties } from "@/lib/queries/properties";

export const Route = createFileRoute("/owner/properties/")({
	component: PropertiesList,
});

const STATUS_BADGE: Record<string, string> = {
	PENDING: "bg-amber-100 text-amber-900",
	READY_FOR_PRODUCTION: "bg-blue-100 text-blue-900",
	IN_PROGRESS: "bg-emerald-100 text-emerald-900",
	COMPLETED: "bg-zinc-200 text-zinc-900",
	ARCHIVED: "bg-zinc-100 text-zinc-600",
};

function PropertiesList() {
	const { data, isLoading } = useProperties();
	return (
		<section className="space-y-4">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold">Properties</h1>
					<p className="text-sm text-muted-foreground">
						Units in the pipeline. Each property snapshots the tenant's default template at
						creation.
					</p>
				</div>
				<Link
					to="/owner/properties/new"
					className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
				>
					New property
				</Link>
			</header>

			{isLoading && <p className="text-sm text-muted-foreground">loading…</p>}

			{data && data.length === 0 && (
				<div className="rounded-lg border border-dashed p-10 text-center">
					<p className="text-sm text-muted-foreground">No properties yet. Create your first one.</p>
				</div>
			)}

			{data && data.length > 0 && (
				<div className="overflow-hidden rounded-lg border">
					<table className="w-full text-sm">
						<thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="px-4 py-2">Name</th>
								<th className="px-4 py-2">Address</th>
								<th className="px-4 py-2">Status</th>
								<th className="px-4 py-2">Area (m²)</th>
								<th className="px-4 py-2">Progress</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{data.map((p) => {
								const pct =
									p.totalMasterSubStages > 0
										? Math.round((p.acceptedMasterSubStages / p.totalMasterSubStages) * 100)
										: 0;
								return (
									<tr key={p.id} className="hover:bg-muted/30">
										<td className="px-4 py-3">
											<Link
												to="/owner/properties/$propertyId"
												params={{ propertyId: p.id }}
												className="font-medium underline-offset-2 hover:underline"
											>
												{p.name}
											</Link>
										</td>
										<td className="px-4 py-3 text-muted-foreground">{p.address}</td>
										<td className="px-4 py-3">
											<span
												className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[p.status] ?? ""}`}
											>
												{p.status}
											</span>
										</td>
										<td className="px-4 py-3">{p.areaSqm}</td>
										<td className="px-4 py-3">
											<div className="flex items-center gap-2">
												<div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
													<div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
												</div>
												<span className="text-xs text-muted-foreground">
													{p.acceptedMasterSubStages}/{p.totalMasterSubStages}
												</span>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
