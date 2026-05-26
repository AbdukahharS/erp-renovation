import { treaty } from "@elysiajs/eden";
import type { App } from "api";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = treaty<App>(baseUrl, {
	fetch: { credentials: "include" },
});

export const apiBaseUrl = baseUrl;

/**
 * Unwrap an Eden Treaty response: throw on error, return data on success.
 * Use this in `queryFn`/`mutationFn` bodies so React Query's error state
 * semantics work without inlining the same `{data, error}` destructuring
 * everywhere.
 *
 * Two error sources are handled:
 *  1. Eden's own `error` channel (non-2xx surfaced as `{ status, value }`).
 *  2. Handlers that return `{ error: "…" }` on the success channel
 *     (typically a 401-with-body when tenant resolution fails). These are
 *     treated as failures and thrown rather than returned, then narrowed
 *     out of the result type via `Exclude` so callers don't have to.
 *
 * The `Exclude<T, ErrorShape>` narrowing means most call sites need no
 * `as` casts. The only remaining static-vs-wire mismatch is Drizzle `Date`
 * ↔ JSON string — see the templates query module for the documented cast.
 */
type ErrorShape = { error: string };
type TreatyLike<T> = {
	data: T | null;
	error: { status: unknown; value: unknown } | null;
};

export async function unwrap<T>(promise: Promise<TreatyLike<T>>): Promise<Exclude<T, ErrorShape>> {
	const { data, error } = await promise;
	if (error) {
		const value = error.value;
		const message =
			typeof value === "string"
				? value
				: value &&
						typeof value === "object" &&
						"error" in value &&
						typeof (value as { error: unknown }).error === "string"
					? (value as { error: string }).error
					: JSON.stringify(value);
		throw new Error(`${String(error.status)} ${message}`);
	}
	if (data === null || data === undefined) throw new Error("empty response");
	if (
		typeof data === "object" &&
		data !== null &&
		"error" in data &&
		typeof (data as { error: unknown }).error === "string" &&
		Object.keys(data as object).length === 1
	) {
		throw new Error(`api error: ${(data as { error: string }).error}`);
	}
	return data as Exclude<T, ErrorShape>;
}
