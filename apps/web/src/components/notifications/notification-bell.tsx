import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
	type NotificationItem,
	useMarkReadMutation,
	useNotificationsQuery,
	useUnreadCountQuery,
} from "@/lib/queries/notifications";

/**
 * Bell icon + unread badge + popover with the most recent notifications.
 * Lives in every role's shell header. Reads are inferred:
 *   - "Mark all read" clears the badge
 *   - Tapping an item navigates to its targetUrl and marks it read
 * For full history use the standalone /notifications route.
 */
export function NotificationBell() {
	const [open, setOpen] = useState(false);
	const unread = useUnreadCountQuery();
	const list = useNotificationsQuery({});
	const markRead = useMarkReadMutation();
	const count = unread.data?.count ?? 0;

	return (
		<div className="relative">
			<button
				type="button"
				className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
				onClick={() => setOpen((v) => !v)}
				aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
			>
				<BellIcon />
				{count > 0 ? (
					<span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
						{count > 99 ? "99+" : count}
					</span>
				) : null}
			</button>
			{open ? (
				<div
					role="dialog"
					aria-label="Notifications"
					className="absolute right-0 z-40 mt-2 w-[22rem] rounded-md border bg-popover shadow-md"
					onMouseLeave={() => setOpen(false)}
				>
					<div className="flex items-center justify-between border-b px-3 py-2">
						<div className="text-sm font-medium">Notifications</div>
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
							disabled={count === 0 || markRead.isPending}
							onClick={() => markRead.mutate({ all: true })}
						>
							Mark all read
						</button>
					</div>
					<div className="max-h-[60vh] overflow-y-auto py-1">
						{list.isPending ? (
							<div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</div>
						) : list.data && list.data.items.length > 0 ? (
							list.data.items.slice(0, 12).map((n) => (
								<NotificationRow
									key={n.id}
									item={n}
									onClick={() => {
										if (!n.readAt) markRead.mutate({ ids: [n.id] });
										setOpen(false);
									}}
								/>
							))
						) : (
							<div className="px-3 py-6 text-center text-sm text-muted-foreground">
								No notifications yet.
							</div>
						)}
					</div>
					<div className="border-t px-3 py-2 text-right">
						<Link
							to="/notifications"
							className="text-xs text-primary hover:underline"
							onClick={() => setOpen(false)}
						>
							See all
						</Link>
					</div>
				</div>
			) : null}
		</div>
	);
}

function NotificationRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
	const body = (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-medium">{item.title}</div>
				{!item.readAt ? (
					<span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
				) : null}
			</div>
			<div className="text-xs text-muted-foreground line-clamp-2">{item.body}</div>
			<div className="text-[10px] text-muted-foreground/70">{formatRelative(item.createdAt)}</div>
		</div>
	);
	if (item.targetUrl) {
		return (
			<Link
				to={item.targetUrl}
				className="block border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
				onClick={onClick}
			>
				{body}
			</Link>
		);
	}
	return (
		<button
			type="button"
			className="w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
			onClick={onClick}
		>
			{body}
		</button>
	);
}

function BellIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-5 w-5"
			role="img"
			aria-label="Bell"
		>
			<title>Bell</title>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>
	);
}

function formatRelative(iso: string): string {
	const date = new Date(iso);
	const diff = Date.now() - date.getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return "just now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return date.toLocaleDateString();
}
