import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "./api";

export const authClient = createAuthClient({
	baseURL: apiBaseUrl,
	fetchOptions: { credentials: "include" },
});

export const { useSession, signIn, signOut } = authClient;

export type SessionMe = {
	user: { id: string; email: string; name: string } | null;
	memberships: Array<{
		tenantId: string;
		tenantSlug: string;
		tenantName: string;
		role: "OWNER" | "INSPECTOR" | "MASTER" | "PROCUREMENT";
	}>;
	activeTenantId: string | null;
	activeRole: "OWNER" | "INSPECTOR" | "MASTER" | "PROCUREMENT" | null;
};

export async function fetchMe(): Promise<SessionMe | null> {
	const res = await fetch(`${apiBaseUrl}/auth/me`, { credentials: "include" });
	if (res.status === 401) return null;
	if (!res.ok) throw new Error(`me: ${res.status}`);
	return (await res.json()) as SessionMe;
}

export async function switchTenant(tenantId: string) {
	const res = await fetch(`${apiBaseUrl}/auth/switch-tenant`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ tenantId }),
	});
	if (!res.ok) throw new Error(`switch-tenant: ${res.status}`);
	return (await res.json()) as { ok: boolean; tenantId: string; role: SessionMe["activeRole"] };
}

export function roleHomePath(role: SessionMe["activeRole"]): string {
	switch (role) {
		case "OWNER":
			return "/owner";
		case "INSPECTOR":
			return "/inspector";
		case "MASTER":
			return "/master";
		case "PROCUREMENT":
			return "/procurement";
		default:
			return "/login";
	}
}
