/**
 * Universal number display: "1 234,56" everywhere, regardless of locale.
 * Thousands: NBSP (U+00A0). Decimal: comma. Trailing zeros stripped.
 * If integer-valued, no decimal separator is shown.
 */

const NBSP = " ";
const DASH = "—";

export type FormatNumberOpts = {
	maxDecimals?: number;
	minDecimals?: number;
};

export function formatNumber(
	value: number | string | null | undefined,
	opts: FormatNumberOpts = {},
): string {
	if (value === null || value === undefined || value === "") return DASH;
	const n = typeof value === "string" ? Number(value) : value;
	if (!Number.isFinite(n)) return DASH;

	const maxDecimals = Math.max(0, Math.floor(opts.maxDecimals ?? 3));
	const minDecimals = Math.max(0, Math.min(Math.floor(opts.minDecimals ?? 0), maxDecimals));

	const negative = n < 0;
	const abs = Math.abs(n);

	// toFixed gives us rounded fixed-point without scientific notation for normal magnitudes.
	const fixed = abs.toFixed(maxDecimals);
	const [intRaw, decRaw = ""] = fixed.split(".");

	const intGrouped = (intRaw ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

	let dec = decRaw;
	// Strip trailing zeros below the minDecimals floor.
	if (dec.length > minDecimals) {
		dec = dec.replace(/0+$/, "");
		if (dec.length < minDecimals) dec = dec.padEnd(minDecimals, "0");
	}

	const body = dec.length > 0 ? `${intGrouped}.${dec}` : intGrouped;
	return negative ? `-${body}` : body;
}
