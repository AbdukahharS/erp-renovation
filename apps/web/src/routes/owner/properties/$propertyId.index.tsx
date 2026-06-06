import { createFileRoute, Link } from "@tanstack/react-router";
import { WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/format-money";
import { formatNumber } from "@/lib/format-number";
import { useProperty } from "@/lib/queries/properties";
import { useCurrencyCode } from "@/lib/queries/tenant-config";

export const Route = createFileRoute("/owner/properties/$propertyId/")({
	staticData: { crumbKey: "crumbs.detail" },
	component: PropertyDetail,
});

const STATUS_BADGE: Record<string, string> = {
	PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
	READY_FOR_PRODUCTION: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
	IN_PROGRESS: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
	COMPLETED: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
	ARCHIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
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
	LOCKED: "bg-zinc-50 border-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800",
	AVAILABLE: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/60",
	IN_PROGRESS: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60",
	SUBMITTED: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/60",
	ACCEPTED: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60",
	REJECTED: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/60",
};

function PropertyDetail() {
	const { t } = useTranslation();
	const { propertyId } = Route.useParams();
	const { data, isLoading } = useProperty(propertyId);
	const currency = useCurrencyCode();

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;

	const allSubStages = data.stages.flatMap((s) => s.subStages);
	const byStatus = new Map<string, typeof allSubStages>();
	for (const ss of allSubStages) {
		const arr = byStatus.get(ss.status) ?? [];
		arr.push(ss);
		byStatus.set(ss.status, arr);
	}

	const layoutLabel =
		data.layoutType === "NEW_BUILD"
			? t("propertyDetail.layoutNewBuild")
			: t("propertyDetail.layoutSecondary");

	return (
		<section className="space-y-6">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Link to="/owner/properties" className="hover:underline">
							{t("propertyDetail.backToProperties")}
						</Link>
						<span>/</span>
					</div>
					<h1 className="text-2xl font-semibold">{data.name}</h1>
					<p className="text-sm text-muted-foreground">{data.address}</p>
					<div className="flex flex-wrap items-center gap-2 pt-1">
						<span
							className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[data.status] ?? ""}`}
						>
							{t(`propertyStatus.${data.status}`, data.status)}
						</span>
						<span className="text-xs text-muted-foreground">
							{t("propertyDetail.metaLine", {
								layout: layoutLabel,
								area: formatNumber(data.areaSqm),
								cost: formatMoney(data.plannedUnitCost, currency),
							})}
						</span>
					</div>
				</div>
				<div className="flex flex-col items-end gap-2">
					<Link
						to="/owner/properties/$propertyId/finance"
						params={{ propertyId }}
						className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
					>
						<WalletIcon className="size-3.5" />
						{t("propertyDetail.openFinance", "Finance & materials")}
					</Link>
					{data.floorPlanAsset && (
						<div className="text-xs text-muted-foreground">
							<div>{t("propertyDetail.floorPlanAttached")}</div>
							<div className="font-mono">{data.floorPlanAsset.contentType}</div>
						</div>
					)}
				</div>
			</header>

			{data.status === "PENDING" && (
				<div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
					{t("propertyDetail.awaitingInspector")}
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
				{COLUMN_ORDER.map((status) => {
					const items = byStatus.get(status) ?? [];
					return (
						<div key={status} className={`rounded-lg border p-2 ${COLUMN_STYLE[status] ?? ""}`}>
							<div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
								<span>{t(`stageStatus.${status}`, status.replace("_", " "))}</span>
								<span>{items.length}</span>
							</div>
							<div className="space-y-2">
								{items.map((ss) => (
									<div key={ss.id} className="rounded-md border bg-card p-2 text-xs shadow-sm">
										<div className="flex items-baseline justify-between gap-2">
											<span className="font-mono text-[10px] text-muted-foreground">{ss.code}</span>
											<span
												className={`rounded px-1.5 py-0.5 text-[10px] ${ss.performerType === "INSPECTOR" ? "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200" : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"}`}
											>
												{t(`role.${ss.performerType.toLowerCase()}`, ss.performerType)}
											</span>
										</div>
										<div className="mt-1 leading-tight">{ss.name}</div>
										{ss.performerType === "MASTER" && Number(ss.wageAmount) > 0 && (
											<div className="mt-1 text-[11px] text-muted-foreground">
												{t("propertyDetail.wageLabel", { amount: ss.wageAmount })}
											</div>
										)}
										{ss.specialization && (
											<div className="text-[11px] text-muted-foreground">
												{t(`specializations.${ss.specialization}`)}
											</div>
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
