import { createFileRoute, Link } from "@tanstack/react-router";
import { useAllPropertiesFinance } from "@/lib/queries/finance";

export const Route = createFileRoute("/owner/finance/")({
	component: AllFinance,
});

function AllFinance() {
	const { data, isLoading } = useAllPropertiesFinance();
	if (isLoading || !data) return <p className="text-sm text-muted-foreground">loading…</p>;

	return (
		<section className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold">Finance</h1>
				<p className="text-sm text-muted-foreground">
					Plan-vs-Actual across all properties. Net profit per TZ §8.2: planned − wages − costs.
				</p>
			</header>

			<div className="overflow-x-auto rounded-lg border">
				<table className="w-full text-sm">
					<thead className="bg-muted/50 text-left text-xs uppercase">
						<tr>
							<th className="px-3 py-2">Property</th>
							<th className="px-3 py-2">Status</th>
							<th className="px-3 py-2 text-right">Planned</th>
							<th className="px-3 py-2 text-right">Wages</th>
							<th className="px-3 py-2 text-right">Costs</th>
							<th className="px-3 py-2 text-right">Net profit</th>
							<th className="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{data.map((r) => {
							const positive = Number(r.netProfit) >= 0;
							return (
								<tr key={r.propertyId} className="border-t">
									<td className="px-3 py-2">
										<Link
											to="/owner/properties/$propertyId/finance"
											params={{ propertyId: r.propertyId }}
											className="font-medium underline"
										>
											{r.propertyName}
										</Link>
										{r.materialsEstimateMissing && (
											<span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
												materials incomplete
											</span>
										)}
									</td>
									<td className="px-3 py-2 text-xs">{r.status}</td>
									<td className="px-3 py-2 text-right tabular-nums">${r.plannedTotal}</td>
									<td className="px-3 py-2 text-right tabular-nums">${r.accruedWages}</td>
									<td className="px-3 py-2 text-right tabular-nums">${r.costsTotal}</td>
									<td
										className={`px-3 py-2 text-right font-medium tabular-nums ${
											positive ? "text-emerald-700" : "text-rose-700"
										}`}
									>
										${r.netProfit}
									</td>
									<td className="px-3 py-2 text-right">
										<Link
											to="/owner/properties/$propertyId/finance"
											params={{ propertyId: r.propertyId }}
											className="text-xs underline"
										>
											details
										</Link>
									</td>
								</tr>
							);
						})}
						{data.length === 0 && (
							<tr>
								<td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
									No properties yet.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}
