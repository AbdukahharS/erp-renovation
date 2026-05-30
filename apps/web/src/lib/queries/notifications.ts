import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";

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
	localizationParams: Record<string, unknown> | null;
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
		queryFn: () =>
			unwrap(
				api.tenant.notifications.get({
					query: { unreadOnly: params.unreadOnly ? "true" : undefined },
				}),
			) as unknown as Promise<{ items: NotificationItem[]; nextCursor: string | null }>,
	});
}

export function useUnreadCountQuery() {
	return useQuery({
		queryKey: notificationsKeys.unreadCount(),
		queryFn: () => unwrap(api.tenant.notifications["unread-count"].get()),
		refetchInterval: 60_000,
	});
}

export function useMarkReadMutation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { ids?: string[]; all?: boolean }) =>
			unwrap(api.tenant.notifications["mark-read"].post(input)),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: notificationsKeys.all });
		},
	});
}
