import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	type NotificationItem,
	useMarkReadMutation,
	useNotificationsQuery,
} from "@/lib/queries/notifications";

export const Route = createFileRoute("/notifications")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
	},
	component: NotificationsInbox,
});

function NotificationsInbox() {
	const list = useNotificationsQuery({});
	const markRead = useMarkReadMutation();

	return (
		<div className="mx-auto max-w-2xl px-4 py-6">
			<div className="mb-4 flex items-center justify-between">
				<h1 className="text-xl font-semibold">Notifications</h1>
				<button
					type="button"
					className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
					disabled={markRead.isPending}
					onClick={() => markRead.mutate({ all: true })}
				>
					Mark all read
				</button>
			</div>
			{list.isPending ? (
				<div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
					Loading…
				</div>
			) : list.data && list.data.items.length > 0 ? (
				<NotificationGroups items={list.data.items} markRead={markRead.mutate} />
			) : (
				<div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
					Nothing here yet.
				</div>
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
				<div className="divide-y rounded-md border bg-card">
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
					<div className="mt-2 divide-y rounded-md border bg-card">
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
				className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
					item.readAt ? "bg-transparent" : "bg-primary"
				}`}
				aria-hidden
			/>
			<div className="flex-1">
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
