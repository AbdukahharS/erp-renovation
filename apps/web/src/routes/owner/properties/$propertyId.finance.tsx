import type { PropertyCostCategory } from "@repo/validators";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAddPropertyCost, usePropertyFinance, useReverseCost } from "@/lib/queries/finance";

export const Route = createFileRoute("/owner/properties/$propertyId/finance")({
	component: PropertyFinance,
});

const CATEGORIES: PropertyCostCategory[] = [
	"MATERIAL",
	"TRANSPORT",
	"EXTERNAL_CONTRACTOR",
	"OTHER",
];

function PropertyFinance() {
	const { propertyId } = Route.useParams();
	const { data, isLoading } = usePropertyFinance(propertyId);
	const addCost = useAddPropertyCost(propertyId);
	const reverseCost = useReverseCost(propertyId);

	const [category, setCategory] = useState<PropertyCostCategory>("MATERIAL");
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");

	if (isLoading || !data) return <p className="text-sm text-muted-foreground">loading…</p>;
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
						← Back to property
					</Link>
				</div>
				<h1 className="text-2xl font-semibold">{summary.propertyName} — finance</h1>
				<p className="text-sm text-muted-foreground">
					{summary.areaSqm} m² · ${summary.plannedUnitCost}/m² · status {summary.status}
				</p>
				{summary.materialsEstimateMissing && (
					<div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
						Materials estimate incomplete — record material costs to make Actual accurate.
					</div>
				)}
			</header>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Stat label="Planned total" value={`$${summary.plannedTotal}`} />
				<Stat label="Wages credited" value={`$${summary.accruedWages}`} />
				<Stat label="Other costs" value={`$${summary.costsTotal}`} />
				<Stat
					label="Net profit"
					value={`$${summary.netProfit}`}
					tone={positive ? "positive" : "negative"}
				/>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{summary.costsByCategory.map((c) => (
					<Stat key={c.category} label={c.category.replace("_", " ")} value={`$${c.total}`} muted />
				))}
			</div>

			<div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
				<form
					onSubmit={submitCost}
					className="space-y-3 rounded-lg border bg-card p-4"
					aria-label="Record cost"
				>
					<h2 className="text-sm font-semibold">Record cost</h2>
					<div className="block text-xs">
						<span className="mb-1 block text-muted-foreground">Category</span>
						<Select value={category} onValueChange={(v) => setCategory(v as PropertyCostCategory)}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CATEGORIES.map((c) => (
									<SelectItem key={c} value={c}>
										{c.replace("_", " ")}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<label className="block text-xs">
						<span className="mb-1 block text-muted-foreground">Amount (USD)</span>
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
						<span className="mb-1 block text-muted-foreground">Description (optional)</span>
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
						{addCost.isPending ? "Saving…" : "Add cost"}
					</button>
					{addCost.error && (
						<p className="text-xs text-rose-700">{(addCost.error as Error).message}</p>
					)}
				</form>

				<div className="rounded-lg border">
					<div className="border-b bg-muted/50 px-3 py-2 text-xs uppercase">Cost ledger</div>
					<table className="w-full text-sm">
						<thead className="text-left text-xs uppercase">
							<tr>
								<th className="px-3 py-2">Date</th>
								<th className="px-3 py-2">Category</th>
								<th className="px-3 py-2">Description</th>
								<th className="px-3 py-2 text-right">Amount</th>
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
									<td className="px-3 py-2 text-xs">{c.category}</td>
									<td className="px-3 py-2 text-xs">{c.description ?? "—"}</td>
									<td className="px-3 py-2 text-right tabular-nums">${c.amount}</td>
									<td className="px-3 py-2 text-right">
										{!c.reversedAt && summary.status !== "ARCHIVED" && (
											<button
												type="button"
												onClick={() => reverseCost.mutate(c.id)}
												className="text-xs underline"
											>
												reverse
											</button>
										)}
									</td>
								</tr>
							))}
							{costs.length === 0 && (
								<tr>
									<td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
										No costs recorded.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{summary.status === "COMPLETED" && (
				<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
					<h2 className="text-sm font-semibold text-emerald-900">Ready to close</h2>
					<p className="mt-1 text-xs text-emerald-900">
						All master stages accepted. Run the final audit to archive the property and generate the
						handover certificate.
					</p>
					<Link
						to="/owner/properties/$propertyId/closing"
						params={{ propertyId }}
						className="mt-3 inline-block rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
					>
						Start closing
					</Link>
				</div>
			)}

			{summary.status === "ARCHIVED" && summary.closedAt && (
				<div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
					Archived on {new Date(summary.closedAt).toISOString().slice(0, 10)}.
				</div>
			)}
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
