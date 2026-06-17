import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, Building2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { apiBaseUrl } from "@/lib/api";

export const Route = createFileRoute("/_admin/tenants/$tenantId")({
	staticData: { crumbKey: "crumbs.detail" },
	component: TenantDetailPage,
});

// ── Types ────────────────────────────────────────────────────────────────────

interface SubStage {
	order: number;
	name: string;
	performerType: string;
	specialization: string | null;
	wageRatePerSqm: string | null;
	standardDurationDays: number | null;
}

interface Stage {
	order: number;
	name: string;
	subStages: SubStage[];
}

interface PropertyRow {
	id: string;
	name: string;
	address: string;
	status: string;
	plannedUnitCost: string | null;
	areaSqm: string | null;
	createdAt: string;
}

interface TenantOverview {
	tenant: {
		id: string;
		name: string;
		slug: string;
		schemaName: string;
		status: string;
		createdAt: string;
		currencyCode: string | null;
		targetUnitCost: string | null;
		ratingWeights: { speed: number; defect: number } | null;
		branding: { displayName?: string } | null;
	};
	propertyStats: {
		total: number;
		byStatus: Record<string, number>;
		properties: PropertyRow[];
	};
	templatePricing: { templateName: string; stages: Stage[] } | null;
	materialPricing: Array<{ id: string; name: string; unit: string; price: string }>;
	financialSummary: {
		byType: Record<string, string>;
		closedCount: number;
		avgNetProfit: string | null;
	};
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function adminFetch<T>(path: string): Promise<T> {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		headers: { "content-type": "application/json" },
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return res.json() as Promise<T>;
}

// ── Component ─────────────────────────────────────────────────────────────────

function TenantDetailPage() {
	const { t } = useTranslation();
	const { tenantId } = Route.useParams();

	const { data, isLoading, error } = useQuery<TenantOverview>({
		queryKey: ["admin-tenant-overview", tenantId],
		queryFn: () => adminFetch(`/admin/tenants/${tenantId}/overview`),
	});

	if (isLoading) return <LoadingSkeleton />;

	if (error || !data) {
		return (
			<div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
				{(error as Error)?.message ?? t("common.error")}
			</div>
		);
	}

	const { tenant, propertyStats, templatePricing, materialPricing, financialSummary } = data;
	const currency = tenant.currencyCode ?? "USD";

	return (
		<div className="space-y-6">
			<PageHeader
				title={tenant.name}
				description={
					<span className="font-mono text-xs text-muted-foreground">{tenant.schemaName}</span>
				}
				actions={
					<Button variant="outline" size="sm" render={<Link to="/tenants" />}>
						<ArrowLeftIcon className="mr-1 size-3.5" />
						{t("tenants.detail.backToList")}
					</Button>
				}
			/>

			{/* ── Config ─────────────────────────────────────────── */}
			<Section title={t("tenants.detail.config")}>
				<dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 text-sm">
					<ConfigItem label={t("tenants.detail.currency")} value={currency} />
					<ConfigItem
						label={t("tenants.detail.targetUnitCost")}
						value={
							tenant.targetUnitCost
								? `${Number(tenant.targetUnitCost).toLocaleString()} ${currency}`
								: t("tenants.detail.notSet")
						}
					/>
					<ConfigItem
						label={t("tenants.detail.speedWeight")}
						value={tenant.ratingWeights?.speed?.toString() ?? t("tenants.detail.notSet")}
					/>
					<ConfigItem
						label={t("tenants.detail.defectWeight")}
						value={tenant.ratingWeights?.defect?.toString() ?? t("tenants.detail.notSet")}
					/>
					<ConfigItem
						label={t("tenants.detail.branding")}
						value={tenant.branding?.displayName ?? t("tenants.detail.notSet")}
					/>
					<ConfigItem label={t("tenants.colStatus")}>
						<Badge
							variant={tenant.status === "ACTIVE" ? "default" : "secondary"}
							className="text-[10px]"
						>
							{t(`tenants.status.${tenant.status}`, tenant.status.toLowerCase())}
						</Badge>
					</ConfigItem>
				</dl>
			</Section>

			{/* ── Properties ─────────────────────────────────────── */}
			<Section title={t("tenants.detail.properties")}>
				<div className="mb-3 flex flex-wrap gap-2">
					<StatChip label={t("tenants.detail.totalProperties")} value={propertyStats.total} />
					{Object.entries(propertyStats.byStatus).map(([status, count]) => (
						<StatChip key={status} label={t(`propertyStatus.${status}`, status)} value={count} />
					))}
				</div>
				{propertyStats.properties.length === 0 ? (
					<EmptyNote text={t("tenants.detail.noProperties")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("common.home")}</TableHead>
								<TableHead>{t("tenants.detail.areaSqm")}</TableHead>
								<TableHead>{t("tenants.detail.plannedCost")}</TableHead>
								<TableHead>{t("colStatus", "Status")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{propertyStats.properties.map((p) => (
								<TableRow key={p.id}>
									<TableCell>
										<div className="font-medium">{p.name}</div>
										<div className="text-xs text-muted-foreground">{p.address}</div>
									</TableCell>
									<TableCell className="tabular-nums">
										{p.areaSqm ? `${Number(p.areaSqm).toLocaleString()} m²` : t("common.em")}
									</TableCell>
									<TableCell className="tabular-nums">
										{p.plannedUnitCost
											? `${Number(p.plannedUnitCost).toLocaleString()} ${currency}`
											: t("common.em")}
									</TableCell>
									<TableCell>
										<Badge variant="outline" className="text-[10px]">
											{t(`propertyStatus.${p.status}`, p.status)}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Section>

			{/* ── Template Pricing ───────────────────────────────── */}
			<Section title={t("tenants.detail.templatePricing")}>
				{!templatePricing ? (
					<EmptyNote text={t("tenants.detail.noTemplate")} />
				) : (
					<div className="space-y-4">
						<p className="text-xs text-muted-foreground">{templatePricing.templateName}</p>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("tenants.detail.performer")}</TableHead>
									<TableHead>{t("tenants.detail.specialization")}</TableHead>
									<TableHead className="text-right">{t("tenants.detail.wageRate")}</TableHead>
									<TableHead className="text-right">{t("tenants.detail.duration")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{templatePricing.stages.map((stage) => (
									<>
										<TableRow key={`stage-${stage.order}`} className="bg-muted/30">
											<TableCell
												colSpan={4}
												className="py-1.5 text-xs font-semibold text-muted-foreground"
											>
												{stage.order}. {stage.name}
											</TableCell>
										</TableRow>
										{stage.subStages.map((ss) => (
											<TableRow key={`ss-${stage.order}-${ss.order}`}>
												<TableCell className="pl-6 text-sm">
													<span className="text-muted-foreground mr-2">
														{stage.order}.{ss.order}
													</span>
													{ss.name}
												</TableCell>
												<TableCell className="text-xs text-muted-foreground">
													<span className="mr-1 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]">
														{ss.performerType}
													</span>
													{ss.specialization ?? t("common.em")}
												</TableCell>
												<TableCell className="text-right tabular-nums text-sm">
													{ss.wageRatePerSqm
														? `${Number(ss.wageRatePerSqm).toLocaleString()} ${currency}`
														: t("common.em")}
												</TableCell>
												<TableCell className="text-right tabular-nums text-sm text-muted-foreground">
													{ss.standardDurationDays ?? t("common.em")}
												</TableCell>
											</TableRow>
										))}
									</>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</Section>

			{/* ── Materials ──────────────────────────────────────── */}
			<Section title={t("tenants.detail.materials")}>
				{materialPricing.length === 0 ? (
					<EmptyNote text={t("tenants.detail.noMaterials")} />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("common.home")}</TableHead>
								<TableHead>Unit</TableHead>
								<TableHead className="text-right">Price ({currency})</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{materialPricing.map((m) => (
								<TableRow key={m.id}>
									<TableCell className="font-medium">{m.name}</TableCell>
									<TableCell className="font-mono text-xs text-muted-foreground">
										{m.unit}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{Number(m.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Section>

			{/* ── Financial Summary ──────────────────────────────── */}
			<Section title={t("tenants.detail.financialSummary")}>
				<div className="flex flex-wrap gap-2">
					<StatChip
						label={t("tenants.detail.closedProperties")}
						value={financialSummary.closedCount}
					/>
					<StatChip
						label={t("tenants.detail.avgNetProfit")}
						value={
							financialSummary.avgNetProfit
								? `${Number(financialSummary.avgNetProfit).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
								: t("common.em")
						}
					/>
					{Object.entries(financialSummary.byType).map(([type, total]) => (
						<StatChip
							key={type}
							label={type.replace(/_/g, " ").toLowerCase()}
							value={`${Number(total).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`}
						/>
					))}
				</div>
			</Section>
		</div>
	);
}

// ── Small sub-components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="rounded-lg border bg-card">
			<div className="border-b px-4 py-3">
				<h2 className="text-sm font-semibold">{title}</h2>
			</div>
			<div className="p-4">{children}</div>
		</div>
	);
}

function ConfigItem({
	label,
	value,
	children,
}: {
	label: string;
	value?: string;
	children?: React.ReactNode;
}) {
	return (
		<div>
			<dt className="text-[11px] text-muted-foreground mb-0.5">{label}</dt>
			<dd className="font-medium">{children ?? value}</dd>
		</div>
	);
}

function StatChip({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-md border bg-muted/30 px-3 py-2 text-center min-w-[7rem]">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="text-sm font-semibold tabular-nums">{value}</div>
		</div>
	);
}

function EmptyNote({ text }: { text: string }) {
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
			<Building2Icon className="size-4 shrink-0" />
			{text}
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-16 w-full" />
			{[1, 2, 3].map((i) => (
				<div key={i} className="rounded-lg border bg-card">
					<div className="border-b px-4 py-3">
						<Skeleton className="h-4 w-32" />
					</div>
					<div className="p-4 space-y-2">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-3/4" />
						<Skeleton className="h-8 w-1/2" />
					</div>
				</div>
			))}
		</div>
	);
}
