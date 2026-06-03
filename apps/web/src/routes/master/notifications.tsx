import { createFileRoute } from "@tanstack/react-router";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

export const Route = createFileRoute("/master/notifications")({
	staticData: { crumbKey: "nav.notifications" },
	component: NotificationsInbox,
});
