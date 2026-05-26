import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildingIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Column, DataTable } from "@/components/layout/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

function PropertiesList() {
	const { t } = useTranslation();
	const { data, isLoading } = useProperties();
	const rows = data ?? [];

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
				const pct =
					p.totalMasterSubStages > 0
						? Math.round((p.acceptedMasterSubStages / p.totalMasterSubStages) * 100)
						: 0;
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

			{isLoading ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : (
				<DataTable
					columns={columns}
					rows={rows}
					rowKey={(r) => r.id}
					empty={
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
					}
				/>
			)}
		</div>
	);
}
