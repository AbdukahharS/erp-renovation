import { Link } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { renderNotification } from "@/lib/notification-render";
import {
	type NotificationItem,
	useMarkReadMutation,
	useNotificationsQuery,
	useUnreadCountQuery,
} from "@/lib/queries/notifications";

export function NotificationBell() {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const unread = useUnreadCountQuery();
	const list = useNotificationsQuery({});
	const markRead = useMarkReadMutation();
	const count = unread.data?.count ?? 0;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={
							count > 0 ? t("notifications.unreadAria", { count }) : t("notifications.plain")
						}
						className="relative"
					/>
				}
			>
				<BellIcon className="size-4" />
				{count > 0 ? (
					<span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
						{count > 99 ? "99+" : count}
					</span>
				) : null}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[22rem] p-0">
				<div className="flex items-center justify-between px-3 py-2">
					<div className="text-sm font-medium">{t("notifications.title")}</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						disabled={count === 0 || markRead.isPending}
						onClick={() => markRead.mutate({ all: true })}
					>
						{t("notifications.markAllRead")}
					</Button>
				</div>
				<Separator />
				<ScrollArea className="max-h-[60vh]">
					{list.isPending ? (
						<div className="px-3 py-6 text-center text-sm text-muted-foreground">
							{t("common.loading")}
						</div>
					) : list.data && list.data.items.length > 0 ? (
						<ul className="py-1">
							{list.data.items.slice(0, 12).map((n) => (
								<NotificationRow
									key={n.id}
									item={n}
									onClick={() => {
										if (!n.readAt) markRead.mutate({ ids: [n.id] });
										setOpen(false);
									}}
								/>
							))}
						</ul>
					) : (
						<div className="px-3 py-6 text-center text-sm text-muted-foreground">
							{t("notifications.empty")}
						</div>
					)}
				</ScrollArea>
				<Separator />
				<div className="px-3 py-2 text-right">
					<Link
						to="/notifications"
						className="text-xs text-primary hover:underline"
						onClick={() => setOpen(false)}
					>
						{t("nav.seeAll")}
					</Link>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function NotificationRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
	const { t } = useTranslation();
	const rendered = renderNotification(item);
	const body = (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-medium">{rendered.title}</div>
				{!item.readAt ? (
					<span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
				) : null}
			</div>
			<div className="line-clamp-2 text-xs text-muted-foreground">{rendered.body}</div>
			<div className="text-[10px] text-muted-foreground/70">
				{formatRelative(item.createdAt, t)}
			</div>
		</div>
	);
	if (item.targetUrl) {
		return (
			<li>
				<Link
					to={item.targetUrl}
					className="block border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
					onClick={onClick}
				>
					{body}
				</Link>
			</li>
		);
	}
	return (
		<li>
			<button
				type="button"
				className="w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
				onClick={onClick}
			>
				{body}
			</button>
		</li>
	);
}

type TFunction = (key: string, options?: Record<string, unknown>) => string;

function formatRelative(iso: string, t: TFunction): string {
	const date = new Date(iso);
	const diff = Date.now() - date.getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return t("notifications.justNow");
	const m = Math.floor(s / 60);
	if (m < 60) return t("notifications.minutesAgo", { n: m });
	const h = Math.floor(m / 60);
	if (h < 24) return t("notifications.hoursAgo", { n: h });
	const d = Math.floor(h / 24);
	if (d < 30) return t("notifications.daysAgo", { n: d });
	return date.toLocaleDateString();
}
