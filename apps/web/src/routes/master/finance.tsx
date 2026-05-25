import { createFileRoute } from "@tanstack/react-router";
import { useSelfMasterFinance } from "@/lib/queries/finance";

export const Route = createFileRoute("/master/finance")({
	component: MasterFinance,
});

function MasterFinance() {
	const { data, isLoading } = useSelfMasterFinance();
	if (isLoading || !data) return <p className="text-sm text-muted-foreground">loading…</p>;

	return (
		<section className="space-y-4">
			<header>
				<h1 className="text-xl font-semibold">My balance</h1>
				<p className="text-sm text-muted-foreground">
					Earnings, fines and payouts. Owner marks payouts settled when paid.
				</p>
			</header>

			<div className="grid grid-cols-2 gap-3">
				<Stat label="Balance" value={`$${data.balance}`} big />
				<Stat label="Wages earned" value={`$${data.wagesCredited}`} />
				<Stat label="Fines" value={`$${data.finesDeducted}`} tone="negative" />
				<Stat label="Settled" value={`$${data.payoutsSettled}`} />
			</div>

			<div className="rounded-lg border">
				<div className="border-b bg-muted/50 px-3 py-2 text-xs uppercase">Transactions</div>
				<table className="w-full text-sm">
					<thead className="text-left text-xs uppercase">
						<tr>
							<th className="px-3 py-2">Date</th>
							<th className="px-3 py-2">Type</th>
							<th className="px-3 py-2">Note</th>
							<th className="px-3 py-2 text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						{data.transactions.map((t) => (
							<tr key={t.id} className="border-t">
								<td className="px-3 py-2 text-xs">
									{new Date(t.createdAt).toISOString().slice(0, 10)}
								</td>
								<td className="px-3 py-2 text-xs">{t.type}</td>
								<td className="px-3 py-2 text-xs">{t.description ?? "—"}</td>
								<td
									className={`px-3 py-2 text-right tabular-nums ${
										Number(t.amount) < 0 ? "text-rose-700" : "text-emerald-700"
									}`}
								>
									${t.amount}
								</td>
							</tr>
						))}
						{data.transactions.length === 0 && (
							<tr>
								<td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
									No transactions yet.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function Stat({
	label,
	value,
	tone,
	big,
}: {
	label: string;
	value: string;
	tone?: "positive" | "negative";
	big?: boolean;
}) {
	const toneClass = tone === "negative" ? "text-rose-700" : "";
	return (
		<div className="rounded-lg border bg-card p-3">
			<div className="text-[11px] uppercase text-muted-foreground">{label}</div>
			<div
				className={`mt-1 ${big ? "text-2xl" : "text-lg"} font-semibold tabular-nums ${toneClass}`}
			>
				{value}
			</div>
		</div>
	);
}
