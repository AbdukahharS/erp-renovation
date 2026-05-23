import { createFileRoute, Link } from "@tanstack/react-router";
import { useProperty } from "@/lib/queries/properties";

export const Route = createFileRoute("/owner/properties/$propertyId")({
	component: PropertyDetail,
});

const STATUS_BADGE: Record<string, string> = {
	PENDING: "bg-amber-100 text-amber-900",
	READY_FOR_PRODUCTION: "bg-blue-100 text-blue-900",
	IN_PROGRESS: "bg-emerald-100 text-emerald-900",
	COMPLETED: "bg-zinc-200 text-zinc-900",
	ARCHIVED: "bg-zinc-100 text-zinc-600",
};

const COLUMN_ORDER = [
	"LOCKED",
	"AVAILABLE",
	"IN_PROGRESS",
	"SUBMITTED",
	"ACCEPTED",
	"REJECTED",
] as const;

const COLUMN_STYLE: Record<string, string> = {
	LOCKED: "bg-zinc-50 border-zinc-200",
	AVAILABLE: "bg-blue-50 border-blue-200",
	IN_PROGRESS: "bg-amber-50 border-amber-200",
	SUBMITTED: "bg-purple-50 border-purple-200",
	ACCEPTED: "bg-emerald-50 border-emerald-200",
	REJECTED: "bg-rose-50 border-rose-200",
};

function PropertyDetail() {
	const { propertyId } = Route.useParams();
	const { data, isLoading } = useProperty(propertyId);

	if (isLoading || !data) return <p className="text-sm text-muted-foreground">loading…</p>;

	const allSubStages = data.stages.flatMap((s) => s.subStages);
	const byStatus = new Map<string, typeof allSubStages>();
	for (const ss of allSubStages) {
		const arr = byStatus.get(ss.status) ?? [];
		arr.push(ss);
		byStatus.set(ss.status, arr);
	}

	return (
		<section className="space-y-6">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Link to="/owner/properties" className="hover:underline">
							Properties
						</Link>
						<span>/</span>
					</div>
					<h1 className="text-2xl font-semibold">{data.name}</h1>
					<p className="text-sm text-muted-foreground">{data.address}</p>
					<div className="flex flex-wrap items-center gap-2 pt-1">
						<span
							className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[data.status] ?? ""}`}
						>
							{data.status}
						</span>
						<span className="text-xs text-muted-foreground">
							{data.layoutType === "NEW_BUILD" ? "New build" : "Secondary"} · {data.areaSqm} m² ·
							planned ${data.plannedUnitCost}
						</span>
					</div>
				</div>
				{data.floorPlanAsset && (
					<div className="text-xs text-muted-foreground">
						<div>Floor plan attached</div>
						<div className="font-mono">{data.floorPlanAsset.contentType}</div>
					</div>
				)}
			</header>

			{data.status === "PENDING" && (
				<div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
					Awaiting Sub-stage 1.1 (Initial Property Acceptance) by an Inspector. The first master
					stage will unlock once 1.1 is accepted.
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
				{COLUMN_ORDER.map((status) => {
					const items = byStatus.get(status) ?? [];
					return (
						<div key={status} className={`rounded-lg border p-2 ${COLUMN_STYLE[status] ?? ""}`}>
							<div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								<span>{status.replace("_", " ")}</span>
								<span>{items.length}</span>
							</div>
							<div className="space-y-2">
								{items.map((ss) => (
									<div key={ss.id} className="rounded-md border bg-card p-2 text-xs shadow-sm">
										<div className="flex items-baseline justify-between gap-2">
											<span className="font-mono text-[10px] text-muted-foreground">{ss.code}</span>
											<span
												className={`rounded px-1.5 py-0.5 text-[10px] ${ss.performerType === "INSPECTOR" ? "bg-blue-100 text-blue-900" : "bg-zinc-200 text-zinc-800"}`}
											>
												{ss.performerType}
											</span>
										</div>
										<div className="mt-1 leading-tight">{ss.name}</div>
										{ss.performerType === "MASTER" && Number(ss.wageAmount) > 0 && (
											<div className="mt-1 text-[11px] text-muted-foreground">
												wage ${ss.wageAmount}
											</div>
										)}
										{ss.specialization && (
											<div className="text-[11px] text-muted-foreground">{ss.specialization}</div>
										)}
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
