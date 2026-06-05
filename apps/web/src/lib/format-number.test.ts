import { describe, expect, test } from "bun:test";

import { formatMoney } from "./format-money";
import { formatNumber } from "./format-number";

const NBSP = " ";

describe("formatNumber", () => {
	test.each([
		[0, "0"],
		[1234, `1${NBSP}234`],
		[1234.5, `1${NBSP}234.5`],
		[1234.567, `1${NBSP}234.567`],
		["7.000", "7"],
		["7.500", "7.5"],
		["-12.30", "-12.3"],
		[1234567.89, `1${NBSP}234${NBSP}567.89`],
	])("formats %p as %p", (input, expected) => {
		expect(formatNumber(input)).toBe(expected);
	});

	test("rounds beyond max decimals", () => {
		// Float-precision aware: 1.2345 in IEEE-754 is ~1.23449… so toFixed(3) → "1.234"
		expect(formatNumber(1.2355)).toBe("1.236");
		expect(formatNumber(1.249, { maxDecimals: 2 })).toBe("1.25");
	});

	test("honors minDecimals", () => {
		expect(formatNumber(7, { minDecimals: 2, maxDecimals: 2 })).toBe("7.00");
		expect(formatNumber(7.5, { minDecimals: 2, maxDecimals: 2 })).toBe("7.50");
	});

	test.each([
		null,
		undefined,
		"",
		"abc",
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("returns dash for %p", (input) => {
		expect(formatNumber(input as number | string | null | undefined)).toBe("—");
	});
});

describe("formatMoney", () => {
	test("appends currency code with non-breaking space", () => {
		expect(formatMoney("1234.50", "USD")).toBe(`1${NBSP}234.5${NBSP}USD`);
		expect(formatMoney(1234, "UZS")).toBe(`1${NBSP}234${NBSP}UZS`);
	});

	test("nullish returns dash", () => {
		expect(formatMoney(null)).toBe("—");
		expect(formatMoney("")).toBe("—");
	});

	test("caps at 2 decimals", () => {
		expect(formatMoney("1.999", "USD")).toBe(`2${NBSP}USD`);
		expect(formatMoney("1.49", "USD")).toBe(`1.49${NBSP}USD`);
	});
});
