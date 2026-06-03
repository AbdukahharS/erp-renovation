import type { PropertyCostCategory } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { IssueMaterialsDialog } from "@/features/warehouse/issue-materials-dialog";
import { useAddPropertyCost, usePropertyFinance, useReverseCost } from "@/lib/queries/finance";
import { usePropertyIssuances, useReverseIssuance } from "@/lib/queries/warehouse";

export const Route = createFileRoute("/owner/properties/$propertyId/finance")({
	component: PropertyFinance,
});

const CATEGORIES: PropertyCostCategory[] = ["TRANSPORT", "EXTERNAL_CONTRACTOR", "OTHER"];

function PropertyFinance() {
	const { t } = useTranslation();
	const { propertyId } = Route.useParams();
	const { data, isLoading } = usePropertyFinance(propertyId);
	const addCost = useAddPropertyCost(propertyId);
	const reverseCost = useReverseCost(propertyId);
	const { data: issuances } = usePropertyIssuances(propertyId);
	const reverseIssuance = useReverseIssuance(propertyId);

	const [category, setCategory] = useState<PropertyCostCategory>("TRANSPORT");
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [reverseIssuanceTarget, setReverseIssuanceTarget] = useState<string | null>(null);

	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;
	const { summary, costs } = data;
	const positive = Number(summary.netProfit) >= 0;

	function submitCost(e: React.FormEvent) {
		e.preventDefault();
		if (!amount.trim()) return;
		addCost.mutate(
			{ category, amount: amount.trim(), description: description.trim() || undefined },
			{
				onSuccess: () => {
					setAmount("");
					setDescription("");
				},
			},
		);
	}

	return (
		<section className="space-y-6">
			<header className="space-y-1">
				<div className="text-xs text-muted-foreground">
					<Link
						to="/owner/properties/$propertyId"
						params={{ propertyId }}
						className="hover:underline"
					>
						{t("propertyFinance.backToProperty")}
					</Link>
				</div>
				<h1 className="text-2xl font-semibold">
					{t("propertyFinance.title", { name: summary.propertyName })}
				</h1>
				<p className="text-sm text-muted-foreground">
					{t("propertyFinance.meta", {
						area: summary.areaSqm,
						cost: summary.plannedUnitCost,
						status: t(`propertyStatus.${summary.status}`, summary.status),
					})}
				</p>
				{summary.materialsEstimateMissing && (
					<div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
						{t("propertyFinance.materialsIncomplete")}
					</div>
				)}
			</header>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<Stat label={t("propertyFinance.plannedTotal")} value={`$${summary.plannedTotal}`} />
				<Stat label={t("propertyFinance.wagesCredited")} value={`$${summary.accruedWages}`} />
				<Stat label={t("propertyFinance.materialsCost")} value={`$${summary.materialsCost}`} />
				<Stat label={t("propertyFinance.otherCosts")} value={`$${summary.costsTotal}`} />
				<Stat
					label={t("propertyFinance.netProfit")}
					value={`$${summary.netProfit}`}
					tone={positive ? "positive" : "negative"}
				/>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{summary.costsByCategory.map((c) => (
					<Stat
						key={c.category}
						label={t(`costCategory.${c.category}`, c.category.replace("_", " "))}
						value={`$${c.total}`}
						muted
					/>
				))}
			</div>

			<div className="rounded-lg border">
				<div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
					<span className="text-xs uppercase">{t("propertyFinance.materialsIssued")}</span>
					<IssueMaterialsDialog propertyId={propertyId} disabled={summary.status === "ARCHIVED"} />
				</div>
				<table className="w-full text-sm">
					<thead className="text-left text-xs uppercase">
						<tr>
							<th className="px-3 py-2">{t("propertyFinance.colDate")}</th>
							<th className="px-3 py-2">{t("warehouse.col.material")}</th>
							<th className="px-3 py-2 text-right">{t("warehouse.col.quantity")}</th>
							<th className="px-3 py-2 text-right">{t("warehouse.col.unitPrice")}</th>
							<th className="px-3 py-2 text-right">{t("propertyFinance.colAmount")}</th>
							<th className="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{(issuances ?? []).map((i) => (
							<tr
								key={i.id}
								className={`border-t ${i.reversedAt ? "text-muted-foreground line-through" : ""}`}
							>
								<td className="px-3 py-2 text-xs">
									{new Date(i.createdAt).toISOString().slice(0, 10)}
								</td>
								<td className="px-3 py-2 text-xs">
									{i.materialName}{" "}
									<span className="text-muted-foreground">
										({t(`warehouse.unit.${i.materialUnit}`, i.materialUnit)})
									</span>
								</td>
								<td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
								<td className="px-3 py-2 text-right tabular-nums">${i.unitPriceSnapshot}</td>
								<td className="px-3 py-2 text-right tabular-nums">${i.amount}</td>
								<td className="px-3 py-2 text-right">
									{!i.reversedAt && summary.status !== "ARCHIVED" && (
										<button
											type="button"
											onClick={() => setReverseIssuanceTarget(i.id)}
											className="text-xs underline"
										>
											{t("propertyFinance.reverse")}
										</button>
									)}
								</td>
							</tr>
						))}
						{(issuances ?? []).length === 0 && (
							<tr>
								<td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
									{t("warehouse.noIssuances")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
				<form
					onSubmit={submitCost}
					className="space-y-3 rounded-lg border bg-card p-4"
					aria-label={t("propertyFinance.recordCostAria")}
				>
					<h2 className="text-sm font-semibold">{t("propertyFinance.recordCost")}</h2>
					<div className="block text-xs">
						<span className="mb-1 block text-muted-foreground">
							{t("propertyFinance.category")}
						</span>
						<Select value={category} onValueChange={(v) => setCategory(v as PropertyCostCategory)}>
							<SelectTrigger className="w-full">
								{/* Base UI's Value renders the raw value verbatim — without a
								    render fn the trigger keeps showing the enum (MATERIAL,
								    TRANSPORT…) instead of the localized label. */}
								<SelectValue>
									{(v) => (v ? t(`costCategory.${v}`, String(v).replace("_", " ")) : "")}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{CATEGORIES.map((c) => (
									<SelectItem key={c} value={c}>
										{t(`costCategory.${c}`, c.replace("_", " "))}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<label className="block text-xs">
						<span className="mb-1 block text-muted-foreground">
							{t("propertyFinance.amountUsd")}
						</span>
						<input
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							placeholder="0.00"
							pattern="^\d+(\.\d{1,2})?$"
							className="w-full rounded border px-2 py-1.5 font-mono"
							required
						/>
					</label>
					<label className="block text-xs">
						<span className="mb-1 block text-muted-foreground">
							{t("propertyFinance.descriptionOptional")}
						</span>
						<input
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="w-full rounded border px-2 py-1.5"
						/>
					</label>
					<button
						type="submit"
						disabled={addCost.isPending || summary.status === "ARCHIVED"}
						className="w-full rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
					>
						{addCost.isPending ? t("common.saving") : t("propertyFinance.addCost")}
					</button>
					{addCost.error && (
						<p className="text-xs text-rose-700">{(addCost.error as Error).message}</p>
					)}
				</form>

				<div className="rounded-lg border">
					<div className="border-b bg-muted/50 px-3 py-2 text-xs uppercase">
						{t("propertyFinance.costLedger")}
					</div>
					<table className="w-full text-sm">
						<thead className="text-left text-xs uppercase">
							<tr>
								<th className="px-3 py-2">{t("propertyFinance.colDate")}</th>
								<th className="px-3 py-2">{t("propertyFinance.colCategory")}</th>
								<th className="px-3 py-2">{t("propertyFinance.colDescription")}</th>
								<th className="px-3 py-2 text-right">{t("propertyFinance.colAmount")}</th>
								<th className="px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{costs.map((c) => (
								<tr
									key={c.id}
									className={`border-t ${c.reversedAt ? "text-muted-foreground line-through" : ""}`}
								>
									<td className="px-3 py-2 text-xs">
										{new Date(c.incurredAt).toISOString().slice(0, 10)}
									</td>
									<td className="px-3 py-2 text-xs">
										{t(`costCategory.${c.category}`, c.category)}
									</td>
									<td className="px-3 py-2 text-xs">{c.description ?? t("common.em")}</td>
									<td className="px-3 py-2 text-right tabular-nums">${c.amount}</td>
									<td className="px-3 py-2 text-right">
										{!c.reversedAt && summary.status !== "ARCHIVED" && (
											<button
												type="button"
												onClick={() => reverseCost.mutate(c.id)}
												className="text-xs underline"
											>
												{t("propertyFinance.reverse")}
											</button>
										)}
									</td>
								</tr>
							))}
							{costs.length === 0 && (
								<tr>
									<td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
										{t("propertyFinance.noCosts")}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{summary.status === "COMPLETED" && (
				<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
					<h2 className="text-sm font-semibold text-emerald-900">
						{t("propertyFinance.readyToClose")}
					</h2>
					<p className="mt-1 text-xs text-emerald-900">{t("propertyFinance.readyToCloseDesc")}</p>
					<Link
						to="/owner/properties/$propertyId/closing"
						params={{ propertyId }}
						className="mt-3 inline-block rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
					>
						{t("propertyFinance.startClosing")}
					</Link>
				</div>
			)}

			{summary.status === "ARCHIVED" && summary.closedAt && (
				<div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
					{t("propertyFinance.archivedOn", {
						date: new Date(summary.closedAt).toISOString().slice(0, 10),
					})}
				</div>
			)}

			<AlertDialog
				open={!!reverseIssuanceTarget}
				onOpenChange={(o) => !o && setReverseIssuanceTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("warehouse.reverseIssuanceTitle")}</AlertDialogTitle>
						<AlertDialogDescription>{t("warehouse.reverseIssuanceConfirm")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setReverseIssuanceTarget(null)}>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (!reverseIssuanceTarget) return;
								reverseIssuance.mutate(reverseIssuanceTarget, {
									onSuccess: () => {
										toast.success(t("warehouse.reversed"));
										setReverseIssuanceTarget(null);
									},
									onError: (e: Error) => toast.error(e.message),
								});
							}}
							disabled={reverseIssuance.isPending}
						>
							{reverseIssuance.isPending ? t("common.saving") : t("propertyFinance.reverse")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

function Stat({
	label,
	value,
	tone,
	muted,
}: {
	label: string;
	value: string;
	tone?: "positive" | "negative";
	muted?: boolean;
}) {
	const toneClass =
		tone === "positive"
			? "text-emerald-700"
			: tone === "negative"
				? "text-rose-700"
				: muted
					? "text-muted-foreground"
					: "";
	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="text-[11px] uppercase text-muted-foreground">{label}</div>
			<div className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
		</div>
	);
}
