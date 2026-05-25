import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { InstallAndPermissionCard } from "@/components/notifications/install-and-permission-card";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/inspector")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "INSPECTOR") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	component: InspectorShell,
});

function InspectorShell() {
	return (
		<div className="min-h-screen bg-background">
			<header className="flex items-center justify-between border-b px-4 py-3">
				<div className="text-base font-semibold">Inspector</div>
				<NotificationBell />
			</header>
			<main className="p-4 space-y-4 text-base">
				<InstallAndPermissionCard />
				<Outlet />
			</main>
		</div>
	);
}
