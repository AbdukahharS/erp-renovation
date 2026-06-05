import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/format-money";
import { useSelfMasterFinance } from "@/lib/queries/finance";
import { useCurrencyCode } from "@/lib/queries/tenant-config";

export const Route = createFileRoute("/master/finance")({
	staticData: { crumbKey: "crumbs.wallet" },
	component: MasterFinance,
});

function MasterFinance() {
	const { t } = useTranslation();
	const { data, isLoading } = useSelfMasterFinance();
	const currency = useCurrencyCode();
	if (isLoading || !data)
		return <p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>;

	return (
		<section className="space-y-4">
			<header>
				<h1 className="text-xl font-semibold">{t("masterFinance.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("masterFinance.description")}</p>
			</header>

			<div className="grid grid-cols-2 gap-3">
				<Stat label={t("masterFinance.balance")} value={formatMoney(data.balance, currency)} big />
				<Stat
					label={t("masterFinance.wagesEarned")}
					value={formatMoney(data.wagesCredited, currency)}
				/>
				<Stat
					label={t("masterFinance.fines")}
					value={formatMoney(data.finesDeducted, currency)}
					tone="negative"
				/>
				<Stat
					label={t("masterFinance.settled")}
					value={formatMoney(data.payoutsSettled, currency)}
				/>
			</div>

			<div className="rounded-lg border">
				<div className="border-b bg-muted/50 px-3 py-2 text-xs uppercase">
					{t("masterFinance.transactions")}
				</div>
				<table className="w-full text-sm">
					<thead className="text-left text-xs uppercase">
						<tr>
							<th className="px-3 py-2">{t("masterFinance.colDate")}</th>
							<th className="px-3 py-2">{t("masterFinance.colType")}</th>
							<th className="px-3 py-2">{t("masterFinance.colNote")}</th>
							<th className="px-3 py-2 text-right">{t("masterFinance.colAmount")}</th>
						</tr>
					</thead>
					<tbody>
						{data.transactions.map((tr) => (
							<tr key={tr.id} className="border-t">
								<td className="px-3 py-2 text-xs">
									{new Date(tr.createdAt).toISOString().slice(0, 10)}
								</td>
								<td className="px-3 py-2 text-xs">
									{t(`masterFinance.txType.${tr.type}`, { defaultValue: tr.type })}
								</td>
								<td className="px-3 py-2 text-xs">
									{tr.descriptionKey
										? t(tr.descriptionKey, {
												...(tr.descriptionParams ?? {}),
												defaultValue: tr.description ?? "",
											})
										: (tr.description ?? t("common.em"))}
								</td>
								<td
									className={`px-3 py-2 text-right tabular-nums ${
										Number(tr.amount) < 0 ? "text-rose-700" : "text-emerald-700"
									}`}
								>
									{formatMoney(tr.amount, currency)}
								</td>
							</tr>
						))}
						{data.transactions.length === 0 && (
							<tr>
								<td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
									{t("masterFinance.noTransactions")}
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
