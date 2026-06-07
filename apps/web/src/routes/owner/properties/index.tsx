import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildingIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Column, DataTable } from "@/components/layout/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useProperties } from "@/lib/queries/properties";

export const Route = createFileRoute("/owner/properties/")({
	staticData: { crumbKey: "nav.properties" },
	component: PropertiesList,
});

type Row = NonNullable<ReturnType<typeof useProperties>["data"]>[number];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
	PENDING: "outline",
	READY_FOR_PRODUCTION: "secondary",
	IN_PROGRESS: "default",
	COMPLETED: "secondary",
	ARCHIVED: "outline",
};

const STATUS_OPTIONS = [
	"PENDING",
	"READY_FOR_PRODUCTION",
	"IN_PROGRESS",
	"COMPLETED",
	"ARCHIVED",
] as const;

type StatusFilter = "ACTIVE" | "ALL" | (typeof STATUS_OPTIONS)[number];
type SortMode = "recent" | "name" | "progress" | "area";

function progressPct(p: Row): number {
	return p.totalMasterSubStages > 0 ? p.acceptedMasterSubStages / p.totalMasterSubStages : 0;
}

function PropertiesList() {
	const { t } = useTranslation();
	const { data, isLoading } = useProperties();
	const rows = data ?? [];

	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<StatusFilter>("ACTIVE");
	const [sort, setSort] = useState<SortMode>("recent");

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = rows.filter((p) => {
			if (status === "ACTIVE") {
				if (p.status === "ARCHIVED") return false;
			} else if (status !== "ALL") {
				if (p.status !== status) return false;
			}
			if (q) {
				const haystack = `${p.name} ${p.address}`.toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			return true;
		});
		const sorted = [...filtered];
		switch (sort) {
			case "name":
				sorted.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case "progress":
				sorted.sort((a, b) => progressPct(b) - progressPct(a));
				break;
			case "area":
				sorted.sort((a, b) => Number(b.areaSqm) - Number(a.areaSqm));
				break;
			default:
				sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
		}
		return sorted;
	}, [rows, search, status, sort]);

	const columns: Column<Row>[] = [
		{
			key: "name",
			header: t("properties.columns.name"),
			cell: (p) => (
				<Link
					to="/owner/properties/$propertyId"
					params={{ propertyId: p.id }}
					className="font-medium hover:underline"
				>
					{p.name}
				</Link>
			),
		},
		{
			key: "address",
			header: t("properties.columns.address"),
			cell: (p) => <span className="text-muted-foreground">{p.address}</span>,
		},
		{
			key: "status",
			header: t("properties.columns.status"),
			cell: (p) => (
				<Badge variant={STATUS_VARIANT[p.status] ?? "outline"} className="text-[10px]">
					{t(`propertyStatus.${p.status}`, p.status.replace(/_/g, " ").toLowerCase())}
				</Badge>
			),
		},
		{
			key: "area",
			header: t("properties.columns.area"),
			cell: (p) => <span className="tabular-nums">{p.areaSqm}</span>,
			className: "text-right",
			headerClassName: "text-right",
		},
		{
			key: "progress",
			header: t("properties.columns.progress"),
			cell: (p) => {
				const pct = Math.round(progressPct(p) * 100);
				return (
					<div className="flex items-center gap-2">
						<Progress value={pct} className="h-1.5 w-24" />
						<span className="text-xs tabular-nums text-muted-foreground">
							{p.acceptedMasterSubStages}/{p.totalMasterSubStages}
						</span>
					</div>
				);
			},
		},
	];

	const hasFiltering = search.trim().length > 0 || status !== "ACTIVE";

	return (
		<div className="space-y-4">
			<PageHeader
				title={t("properties.title")}
				description={t("properties.description")}
				actions={
					<Button nativeButton={false} render={<Link to="/owner/properties/new" />}>
						<PlusIcon className="mr-1 size-4" />
						{t("properties.newProperty")}
					</Button>
				}
			/>

			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-0 flex-1 sm:max-w-xs">
					<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("properties.searchPlaceholder")}
						className="h-8 pl-8 text-xs"
					/>
				</div>
				<Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
					<SelectTrigger className="h-8 w-auto min-w-[10rem] text-xs">
						{/* Base UI SelectValue defaults to the raw value — render a
						    function so the trigger shows the localized label. */}
						<SelectValue placeholder={t("properties.filterStatus")}>
							{(v) => {
								const key = String(v ?? "");
								if (key === "ACTIVE") return t("properties.filterActive");
								if (key === "ALL") return t("properties.filterAll");
								return t(`propertyStatus.${key}`, key.replace(/_/g, " ").toLowerCase());
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="ACTIVE">{t("properties.filterActive")}</SelectItem>
						<SelectItem value="ALL">{t("properties.filterAll")}</SelectItem>
						{STATUS_OPTIONS.map((s) => (
							<SelectItem key={s} value={s}>
								{t(`propertyStatus.${s}`, s.replace(/_/g, " ").toLowerCase())}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
					<SelectTrigger className="h-8 w-auto min-w-[10rem] text-xs">
						<SelectValue placeholder={t("properties.sortBy")}>
							{(v) => {
								switch (String(v ?? "")) {
									case "name":
										return t("properties.sortNameAsc");
									case "progress":
										return t("properties.sortProgressDesc");
									case "area":
										return t("properties.sortAreaDesc");
									default:
										return t("properties.sortRecent");
								}
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="recent">{t("properties.sortRecent")}</SelectItem>
						<SelectItem value="name">{t("properties.sortNameAsc")}</SelectItem>
						<SelectItem value="progress">{t("properties.sortProgressDesc")}</SelectItem>
						<SelectItem value="area">{t("properties.sortAreaDesc")}</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{isLoading ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : (
				<DataTable
					columns={columns}
					rows={visible}
					rowKey={(r) => r.id}
					empty={
						hasFiltering && rows.length > 0 ? (
							<EmptyState
								icon={SearchIcon}
								title={t("properties.emptyFilteredTitle")}
								description={t("properties.emptyFilteredDescription")}
							/>
						) : (
							<EmptyState
								icon={BuildingIcon}
								title={t("properties.emptyTitle")}
								description={t("properties.emptyDescription")}
								action={
									<Button nativeButton={false} render={<Link to="/owner/properties/new" />}>
										<PlusIcon className="mr-1 size-4" />
										{t("properties.newProperty")}
									</Button>
								}
							/>
						)
					}
				/>
			)}
		</div>
	);
}
