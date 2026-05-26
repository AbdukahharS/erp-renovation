import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type NotificationItem,
	useMarkReadMutation,
	useNotificationsQuery,
} from "@/lib/queries/notifications";

export const Route = createFileRoute("/notifications")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
	},
	staticData: { crumb: "Notifications" },
	component: NotificationsInbox,
});

function NotificationsInbox() {
	const list = useNotificationsQuery({});
	const markRead = useMarkReadMutation();

	return (
		<div className="mx-auto max-w-2xl px-4 py-6">
			<PageHeader
				title="Notifications"
				description="Everything sent to you. Pushes and inbox are mirrors of the same record."
				actions={
					<Button
						variant="outline"
						size="sm"
						disabled={markRead.isPending}
						onClick={() => markRead.mutate({ all: true })}
					>
						<CheckCheckIcon className="mr-1 size-4" />
						Mark all read
					</Button>
				}
			/>
			{list.isPending ? (
				<div className="space-y-2">
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
				</div>
			) : list.data && list.data.items.length > 0 ? (
				<NotificationGroups items={list.data.items} markRead={markRead.mutate} />
			) : (
				<EmptyState
					icon={BellIcon}
					title="Nothing here yet"
					description="When something is assigned, accepted, or rejected, it'll land here."
				/>
			)}
		</div>
	);
}

function NotificationGroups({
	items,
	markRead,
}: {
	items: NotificationItem[];
	markRead: (input: { ids?: string[]; all?: boolean }) => void;
}) {
	const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
	const recent: NotificationItem[] = [];
	const history: NotificationItem[] = [];
	for (const n of items) {
		(new Date(n.createdAt).getTime() >= cutoff ? recent : history).push(n);
	}
	return (
		<div className="space-y-6">
			<section>
				<h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Recent
				</h2>
				<div className="divide-y rounded-lg border bg-card">
					{recent.length === 0 ? (
						<div className="p-4 text-sm text-muted-foreground">No recent notifications.</div>
					) : (
						recent.map((n) => (
							<NotificationRow
								key={n.id}
								item={n}
								onOpen={() => {
									if (!n.readAt) markRead({ ids: [n.id] });
								}}
							/>
						))
					)}
				</div>
			</section>
			{history.length > 0 ? (
				<details>
					<summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
						History ({history.length})
					</summary>
					<div className="mt-2 divide-y rounded-lg border bg-card">
						{history.map((n) => (
							<NotificationRow
								key={n.id}
								item={n}
								onOpen={() => {
									if (!n.readAt) markRead({ ids: [n.id] });
								}}
							/>
						))}
					</div>
				</details>
			) : null}
		</div>
	);
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
	const content = (
		<div className="flex items-start gap-3 p-3">
			<span
				className={`mt-2 size-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`}
				aria-hidden
			/>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{item.title}</div>
				<div className="text-xs text-muted-foreground">{item.body}</div>
				<div className="mt-1 text-[10px] text-muted-foreground/70">
					{new Date(item.createdAt).toLocaleString()}
				</div>
			</div>
		</div>
	);
	if (item.targetUrl) {
		return (
			<Link to={item.targetUrl} className="block hover:bg-muted/50" onClick={onOpen}>
				{content}
			</Link>
		);
	}
	return (
		<button type="button" className="w-full text-left hover:bg-muted/50" onClick={onOpen}>
			{content}
		</button>
	);
}
