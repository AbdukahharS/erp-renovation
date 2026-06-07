import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangleIcon, ChevronRightIcon, HardHatIcon, InboxIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailableStages, useMyStages } from "@/lib/queries/acceptance";

export const Route = createFileRoute("/master/")({
	staticData: { crumbKey: "common.home" },
	component: MasterHome,
});

function MasterHome() {
	const { t } = useTranslation();
	const available = useAvailableStages();
	const mine = useMyStages();

	const rejected = (mine.data ?? []).filter((s) => s.status === "REJECTED");
	const active = (mine.data ?? []).filter((s) => s.status !== "REJECTED");

	return (
		<div className="space-y-6">
			{rejected.length > 0 && (
				<section>
					<div className="mb-3 flex items-center gap-2">
						<AlertTriangleIcon className="size-4 text-destructive" />
						<h2 className="text-lg font-semibold text-destructive">
							{t("masterHome.reworkTitle")}
						</h2>
					</div>
					<p className="mb-3 text-xs text-muted-foreground">{t("masterHome.reworkDesc")}</p>
					<div className="space-y-2">
						{rejected.map((s) => (
							<StageRow
								key={s.subStageInstanceId}
								to={s.subStageInstanceId}
								code={s.code}
								title={s.name}
								subtitle={`${s.propertyName} · ${s.stageName}`}
								right={
									<Badge variant="destructive" className="text-[10px]">
										{t("stageStatus.REJECTED")}
									</Badge>
								}
								wage={s.wageAmount}
								tone="destructive"
							/>
						))}
					</div>
				</section>
			)}

			<Section
				title={t("masterHome.inProgressTitle")}
				description={t("masterHome.inProgressDesc")}
				loading={mine.isLoading}
				empty={
					active.length === 0 ? (
						<EmptyState
							icon={HardHatIcon}
							title={t("masterHome.noClaimsTitle")}
							description={t("masterHome.noClaimsDesc")}
						/>
					) : null
				}
			>
				{active.map((s) => (
					<StageRow
						key={s.subStageInstanceId}
						to={s.subStageInstanceId}
						code={s.code}
						title={s.name}
						subtitle={`${s.propertyName} · ${s.stageName}`}
						right={
							<Badge variant={statusVariant(s.status)} className="text-[10px]">
								{t(`stageStatus.${s.status}`, { defaultValue: s.status.toLowerCase() })}
							</Badge>
						}
						wage={s.wageAmount}
					/>
				))}
			</Section>

			<Section
				title={t("masterHome.availableTitle")}
				description={t("masterHome.availableDesc")}
				loading={available.isLoading}
				empty={
					(available.data?.length ?? 0) === 0 ? (
						<EmptyState
							icon={InboxIcon}
							title={t("masterHome.nothingAvailableTitle")}
							description={t("masterHome.nothingAvailableDesc")}
						/>
					) : null
				}
			>
				{available.data?.map((s) => (
					<StageRow
						key={s.subStageInstanceId}
						to={s.subStageInstanceId}
						code={s.code}
						title={s.name}
						subtitle={`${s.propertyName} · ${s.stageName}`}
						right={
							s.specialization ? (
								<Badge variant="secondary" className="text-[10px]">
									{t(`specializations.${s.specialization}`)}
								</Badge>
							) : null
						}
						wage={s.wageAmount}
					/>
				))}
			</Section>
		</div>
	);
}

function Section({
	title,
	description,
	loading,
	empty,
	children,
}: {
	title: string;
	description: string;
	loading: boolean;
	empty: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section>
			<div className="mb-3">
				<h2 className="text-lg font-semibold">{title}</h2>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			{loading ? (
				<div className="space-y-2">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</div>
			) : empty ? (
				empty
			) : (
				<div className="space-y-2">{children}</div>
			)}
		</section>
	);
}

function StageRow({
	to,
	code,
	title,
	subtitle,
	right,
	wage,
	tone,
}: {
	to: string;
	code: string;
	title: string;
	subtitle: string;
	right: React.ReactNode;
	wage: string | number;
	tone?: "destructive";
}) {
	const toneClasses =
		tone === "destructive"
			? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10 active:bg-destructive/15"
			: "hover:bg-accent active:bg-accent/80";
	return (
		<Link to="/master/stages/$subStageId" params={{ subStageId: to }}>
			<Card className={`p-4 transition-colors ${toneClasses}`}>
				<div className="flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="font-mono text-[10px] uppercase text-muted-foreground">{code}</span>
							{right}
						</div>
						<div className="mt-0.5 truncate text-base font-medium">{title}</div>
						<div className="truncate text-sm text-muted-foreground">{subtitle}</div>
						<div className="mt-1 text-sm font-medium tabular-nums">${wage}</div>
					</div>
					<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
				</div>
			</Card>
		</Link>
	);
}

function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" | undefined {
	if (status === "SUBMITTED") return "default";
	if (status === "REJECTED") return "destructive";
	return "secondary";
}
