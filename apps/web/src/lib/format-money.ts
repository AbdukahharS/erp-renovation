/**
 * Money display: universal "1 234,56" format (see format-number.ts), with the
 * tenant's currency code appended. We deliberately do not use Intl currency
 * formatting — it varies punctuation per locale and we want one consistent look.
 */
import { formatNumber } from "@/lib/format-number";

export function formatMoney(
	amount: number | string | null | undefined,
	currencyCode = "USD",
): string {
	const formatted = formatNumber(amount, { maxDecimals: 2 });
	if (formatted === "—") return "—";
	return `${formatted} ${currencyCode}`;
}
