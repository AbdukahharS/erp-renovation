import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "../api";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${apiBaseUrl}${path}`, {
		credentials: "include",
		...init,
		headers: {
			"content-type": "application/json",
			...(init.headers ?? {}),
		},
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`${res.status} ${text}`);
	}
	return (await res.json()) as T;
}

export interface NotificationItem {
	id: string;
	type:
		| "STAGE_AVAILABLE"
		| "STAGE_SUBMITTED"
		| "STAGE_REJECTED"
		| "STAGE_BLOCKED"
		| "STAGE_UNBLOCKED";
	title: string;
	body: string;
	targetUrl: string | null;
	propertyId: string | null;
	subStageInstanceId: string | null;
	readAt: string | null;
	createdAt: string;
}

export const notificationsKeys = {
	all: ["notifications"] as const,
	list: (params: { unreadOnly?: boolean }) => [...notificationsKeys.all, "list", params] as const,
	unreadCount: () => [...notificationsKeys.all, "unread-count"] as const,
};

export function useNotificationsQuery(params: { unreadOnly?: boolean } = {}) {
	return useQuery({
		queryKey: notificationsKeys.list(params),
		queryFn: async () => {
			const q = new URLSearchParams();
			if (params.unreadOnly) q.set("unreadOnly", "true");
			return await call<{ items: NotificationItem[]; nextCursor: string | null }>(
				`/tenant/notifications/?${q.toString()}`,
			);
		},
	});
}

export function useUnreadCountQuery() {
	return useQuery({
		queryKey: notificationsKeys.unreadCount(),
		queryFn: () => call<{ count: number }>("/tenant/notifications/unread-count"),
		refetchInterval: 60_000,
	});
}

export function useMarkReadMutation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: { ids?: string[]; all?: boolean }) =>
			await call<{ updated: number }>("/tenant/notifications/mark-read", {
				method: "POST",
				body: JSON.stringify(input),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: notificationsKeys.all });
		},
	});
}
