import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatedOutlet } from "@/components/animated-outlet";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FieldTabs } from "@/components/layout/field-tabs";
import { InstallAndPermissionCard } from "@/components/notifications/install-and-permission-card";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/master")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "MASTER") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	staticData: { crumbKey: "role.master" },
	component: MasterShell,
});

function MasterShell() {
	const { t } = useTranslation();
	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="text-base font-semibold">{t("role.master")}</div>
				<div className="flex items-center gap-1">
					<LanguageSwitcher />
					<ThemeToggle />
					<NotificationBell />
				</div>
			</header>
			<main className="mx-auto max-w-md space-y-4 p-4 pb-24 text-base">
				<InstallAndPermissionCard />
				<AnimatedOutlet />
			</main>
			<FieldTabs variant="master" />
		</div>
	);
}
