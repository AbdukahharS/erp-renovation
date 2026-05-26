import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRightIcon,
	BuildingIcon,
	CheckCircle2Icon,
	ClockIcon,
	PlusIcon,
	WalletIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useProperties } from "@/lib/queries/properties";

export const Route = createFileRoute("/owner/")({
	staticData: { crumbKey: "nav.dashboard" },
	component: OwnerHome,
});

function OwnerHome() {
	const { t } = useTranslation();
	const { data, isLoading } = useProperties();
	const properties = data ?? [];

	const inProgress = properties.filter((p) => p.status === "IN_PROGRESS").length;
	const readyForAcceptance = properties.filter((p) => p.status === "READY_FOR_PRODUCTION").length;
	const completed = properties.filter((p) => p.status === "COMPLETED").length;
	const totalProgress = properties.reduce(
		(acc, p) => {
			acc.done += p.acceptedMasterSubStages;
			acc.total += p.totalMasterSubStages;
			return acc;
		},
		{ done: 0, total: 0 },
	);
	const overallPct =
		totalProgress.total > 0 ? Math.round((totalProgress.done / totalProgress.total) * 100) : 0;

	return (
		<div className="space-y-6">
			<PageHeader
				title={t("ownerHome.title")}
				description={t("ownerHome.description")}
				actions={
					<Button nativeButton={false} render={<Link to="/owner/properties/new" />}>
						<PlusIcon className="mr-1 size-4" />
						{t("ownerHome.newProperty")}
					</Button>
				}
			/>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label={t("ownerHome.stats.inProgress")}
					value={isLoading ? "—" : inProgress}
					hint={t("ownerHome.stats.inProgressHint")}
					icon={ClockIcon}
				/>
				<StatCard
					label={t("ownerHome.stats.readyForProduction")}
					value={isLoading ? "—" : readyForAcceptance}
					hint={t("ownerHome.stats.readyForProductionHint")}
					icon={BuildingIcon}
				/>
				<StatCard
					label={t("ownerHome.stats.completed")}
					value={isLoading ? "—" : completed}
					hint={t("ownerHome.stats.completedHint")}
					icon={CheckCircle2Icon}
				/>
				<StatCard
					label={t("ownerHome.stats.pipelineProgress")}
					value={`${overallPct}%`}
					hint={t("ownerHome.stats.pipelineProgressHint", {
						done: totalProgress.done,
						total: totalProgress.total,
					})}
					icon={WalletIcon}
				/>
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>{t("ownerHome.activeProperties")}</CardTitle>
					<Button
						variant="ghost"
						size="sm"
						nativeButton={false}
						render={<Link to="/owner/properties" />}
					>
						{t("ownerHome.viewAll")}
						<ArrowRightIcon className="ml-1 size-4" />
					</Button>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : properties.length === 0 ? (
						<EmptyState
							icon={BuildingIcon}
							title={t("ownerHome.emptyTitle")}
							description={t("ownerHome.emptyDescription")}
							action={
								<Button nativeButton={false} render={<Link to="/owner/properties/new" />}>
									<PlusIcon className="mr-1 size-4" />
									{t("ownerHome.newProperty")}
								</Button>
							}
						/>
					) : (
						<ul className="divide-y">
							{properties.slice(0, 6).map((p) => {
								const pct =
									p.totalMasterSubStages > 0
										? Math.round((p.acceptedMasterSubStages / p.totalMasterSubStages) * 100)
										: 0;
								return (
									<li key={p.id}>
										<Link
											to="/owner/properties/$propertyId"
											params={{ propertyId: p.id }}
											className="flex items-center gap-4 py-3 hover:bg-muted/40"
										>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<span className="truncate font-medium">{p.name}</span>
													<StatusBadge status={p.status} />
												</div>
												<div className="truncate text-xs text-muted-foreground">{p.address}</div>
											</div>
											<div className="hidden w-48 shrink-0 sm:block">
												<div className="flex items-center gap-2">
													<Progress value={pct} className="h-1.5" />
													<span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
														{pct}%
													</span>
												</div>
											</div>
											<ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
	PENDING: "outline",
	READY_FOR_PRODUCTION: "secondary",
	IN_PROGRESS: "default",
	COMPLETED: "secondary",
	ARCHIVED: "outline",
};

function StatusBadge({ status }: { status: string }) {
	const { t } = useTranslation();
	const fallback = status.replace(/_/g, " ").toLowerCase();
	return (
		<Badge variant={STATUS_VARIANT[status] ?? "outline"} className="text-[10px]">
			{t(`propertyStatus.${status}`, { defaultValue: fallback })}
		</Badge>
	);
}
