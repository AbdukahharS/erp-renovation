import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckSquareIcon, ChevronRightIcon, ClipboardCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useInspectorQueue } from "@/lib/queries/acceptance";

export const Route = createFileRoute("/inspector/")({
	staticData: { crumbKey: "common.home" },
	component: InspectorQueueView,
});

function InspectorQueueView() {
	const { t } = useTranslation();
	const { data, isLoading } = useInspectorQueue();

	return (
		<div className="space-y-6">
			<section>
				<div className="mb-3">
					<h2 className="text-lg font-semibold">{t("inspectorHome.awaitingTitle")}</h2>
					<p className="text-xs text-muted-foreground">{t("inspectorHome.awaitingDesc")}</p>
				</div>
				{isLoading ? (
					<Skeletons />
				) : (data?.submitted.length ?? 0) === 0 ? (
					<EmptyState
						icon={ClipboardCheckIcon}
						title={t("inspectorHome.emptyQueueTitle")}
						description={t("inspectorHome.emptyQueueDesc")}
					/>
				) : (
					<div className="space-y-2">
						{data?.submitted.map((s) => (
							<StageRow
								key={s.subStageInstanceId}
								to={s.subStageInstanceId}
								code={s.code}
								title={s.name}
								subtitle={`${s.propertyName} · ${s.stageName}`}
								badge={
									<Badge className="text-[10px]">
										{t(`stageStatus.${s.status}`, { defaultValue: s.status.toLowerCase() })}
									</Badge>
								}
							/>
						))}
					</div>
				)}
			</section>

			<section>
				<div className="mb-3">
					<h2 className="text-lg font-semibold">{t("inspectorHome.directTitle")}</h2>
					<p className="text-xs text-muted-foreground">{t("inspectorHome.directDesc")}</p>
				</div>
				{isLoading ? (
					<Skeletons />
				) : (data?.direct.length ?? 0) === 0 ? (
					<EmptyState
						icon={CheckSquareIcon}
						title={t("inspectorHome.emptyDirectTitle")}
						description={t("inspectorHome.emptyDirectDesc")}
					/>
				) : (
					<div className="space-y-2">
						{data?.direct.map((s) => (
							<StageRow
								key={s.subStageInstanceId}
								to={s.subStageInstanceId}
								code={s.code}
								title={s.name}
								subtitle={`${s.propertyName} · ${s.stageName}`}
								badge={
									<Badge variant="secondary" className="text-[10px]">
										{t(`stageStatus.${s.status}`, { defaultValue: s.status.toLowerCase() })}
									</Badge>
								}
							/>
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function Skeletons() {
	return (
		<div className="space-y-2">
			<Skeleton className="h-20 w-full" />
			<Skeleton className="h-20 w-full" />
		</div>
	);
}

function StageRow({
	to,
	code,
	title,
	subtitle,
	badge,
}: {
	to: string;
	code: string;
	title: string;
	subtitle: string;
	badge: React.ReactNode;
}) {
	return (
		<Link to="/inspector/stages/$subStageId" params={{ subStageId: to }}>
			<Card className="p-4 transition-colors hover:bg-accent active:bg-accent/80">
				<div className="flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="font-mono text-[10px] uppercase text-muted-foreground">{code}</span>
							{badge}
						</div>
						<div className="mt-0.5 truncate text-base font-medium">{title}</div>
						<div className="truncate text-sm text-muted-foreground">{subtitle}</div>
					</div>
					<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
				</div>
			</Card>
		</Link>
	);
}
