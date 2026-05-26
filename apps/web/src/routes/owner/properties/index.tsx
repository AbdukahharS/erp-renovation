import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildingIcon, PlusIcon } from "lucide-react";
import { type Column, DataTable } from "@/components/layout/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useProperties } from "@/lib/queries/properties";

export const Route = createFileRoute("/owner/properties/")({
	staticData: { crumb: "Properties" },
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

const columns: Column<Row>[] = [
	{
		key: "name",
		header: "Name",
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
		header: "Address",
		cell: (p) => <span className="text-muted-foreground">{p.address}</span>,
	},
	{
		key: "status",
		header: "Status",
		cell: (p) => (
			<Badge variant={STATUS_VARIANT[p.status] ?? "outline"} className="text-[10px]">
				{p.status.replace(/_/g, " ").toLowerCase()}
			</Badge>
		),
	},
	{
		key: "area",
		header: "Area (m²)",
		cell: (p) => <span className="tabular-nums">{p.areaSqm}</span>,
		className: "text-right",
		headerClassName: "text-right",
	},
	{
		key: "progress",
		header: "Progress",
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

function PropertiesList() {
	const { data, isLoading } = useProperties();
	const rows = data ?? [];

	return (
		<div className="space-y-4">
			<PageHeader
				title="Properties"
				description="Units in the pipeline. Each property snapshots the tenant's default template at creation."
				actions={
					<Button nativeButton={false} render={<Link to="/owner/properties/new" />}>
						<PlusIcon className="mr-1 size-4" />
						New property
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
							title="No properties yet"
							description="Create your first property to start the pipeline."
							action={
								<Button nativeButton={false} render={<Link to="/owner/properties/new" />}>
									<PlusIcon className="mr-1 size-4" />
									New property
								</Button>
							}
						/>
					}
				/>
			)}
		</div>
	);
}
