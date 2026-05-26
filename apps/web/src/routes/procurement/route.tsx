import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/procurement")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "PROCUREMENT") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	staticData: { crumbKey: "role.procurement" },
	component: ProcurementShell,
});

function ProcurementShell() {
	const { t } = useTranslation();
	return (
		<div className="min-h-screen bg-background">
			<header className="flex items-center justify-between border-b px-4 py-3">
				<div className="text-base font-semibold">{t("role.procurement")}</div>
				<div className="flex items-center gap-1">
					<LanguageSwitcher />
					<ThemeToggle />
					<NotificationBell />
				</div>
			</header>
			<main className="p-4">
				<Outlet />
			</main>
		</div>
	);
}
