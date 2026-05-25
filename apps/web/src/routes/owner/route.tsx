import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/owner")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "OWNER") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	component: OwnerShell,
});

function OwnerShell() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b px-6 py-3 flex items-center justify-between">
				<div className="text-sm font-semibold">ERP — Owner</div>
				<div className="flex items-center gap-4">
					<div className="text-xs text-muted-foreground">desktop-dense shell</div>
					<NotificationBell />
				</div>
			</header>
			<main className="p-6">
				<Outlet />
			</main>
		</div>
	);
}
