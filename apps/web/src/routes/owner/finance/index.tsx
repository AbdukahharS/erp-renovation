import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAllPropertiesFinance } from "@/lib/queries/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/owner/finance/")({
	staticData: { crumbKey: "nav.finance" },
	component: AllFinance,
});

function AllFinance() {
	const { t } = useTranslation();
	const { data, isLoading } = useAllPropertiesFinance();

	return (
		<div className="space-y-4">
			<PageHeader title={t("finance.title")} description={t("finance.description")} />

			{isLoading ? (
				<div className="space-y-2 rounded-lg border bg-card p-4">
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
				</div>
			) : !data || data.length === 0 ? (
				<EmptyState
					icon={WalletIcon}
					title={t("finance.emptyTitle")}
					description={t("finance.emptyDescription")}
				/>
			) : (
				<div className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("finance.colProperty")}</TableHead>
								<TableHead>{t("finance.colStatus")}</TableHead>
								<TableHead className="text-right">{t("finance.colPlanned")}</TableHead>
								<TableHead className="text-right">{t("finance.colWages")}</TableHead>
								<TableHead className="text-right">{t("finance.colCosts")}</TableHead>
								<TableHead className="text-right">{t("finance.colNetProfit")}</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((r) => {
								const positive = Number(r.netProfit) >= 0;
								return (
									<TableRow key={r.propertyId}>
										<TableCell>
											<Link
												to="/owner/properties/$propertyId/finance"
												params={{ propertyId: r.propertyId }}
												className="font-medium hover:underline"
											>
												{r.propertyName}
											</Link>
											{r.materialsEstimateMissing ? (
												<Badge variant="outline" className="ml-2 text-[10px]">
													{t("finance.materialsIncomplete")}
												</Badge>
											) : null}
										</TableCell>
										<TableCell className="text-xs">
											<Badge variant="outline" className="text-[10px]">
												{t(`propertyStatus.${r.status}`, r.status.replace(/_/g, " ").toLowerCase())}
											</Badge>
										</TableCell>
										<TableCell className="text-right tabular-nums">${r.plannedTotal}</TableCell>
										<TableCell className="text-right tabular-nums">${r.accruedWages}</TableCell>
										<TableCell className="text-right tabular-nums">${r.costsTotal}</TableCell>
										<TableCell
											className={cn(
												"text-right font-medium tabular-nums",
												positive
													? "text-emerald-700 dark:text-emerald-400"
													: "text-rose-700 dark:text-rose-400",
											)}
										>
											${r.netProfit}
										</TableCell>
										<TableCell className="text-right">
											<Link
												to="/owner/properties/$propertyId/finance"
												params={{ propertyId: r.propertyId }}
												aria-label={t("finance.openAria")}
												className="inline-flex"
											>
												<ArrowRightIcon className="size-4 text-muted-foreground" />
											</Link>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
