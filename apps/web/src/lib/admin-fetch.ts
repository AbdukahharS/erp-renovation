import { apiBaseUrl } from "./api";

/**
 * Thin fetch for the superadmin `/admin/*` endpoints. These are not exposed
 * through the Eden treaty client, so the admin pages call them directly with
 * credentials. Throws on non-2xx so it composes with TanStack Query.
 */
export async function adminFetch<T>(path: string): Promise<T> {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		headers: { "content-type": "application/json" },
	});
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return res.json() as Promise<T>;
}
