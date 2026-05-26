/**
 * Phase 9: per-tenant currency display. Amounts come from the API as
 * `numeric(14,2)` strings; this formats them in the tenant's configured
 * currency. Default USD if config hasn't loaded yet.
 */
export function formatMoney(
	amount: number | string | null | undefined,
	currencyCode = "USD",
): string {
	if (amount === null || amount === undefined || amount === "") return "—";
	const n = typeof amount === "string" ? Number(amount) : amount;
	if (!Number.isFinite(n)) return "—";
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currencyCode,
			maximumFractionDigits: 2,
		}).format(n);
	} catch {
		return `${currencyCode} ${n.toFixed(2)}`;
	}
}
