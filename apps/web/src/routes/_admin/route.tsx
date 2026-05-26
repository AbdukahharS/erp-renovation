import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ArrowLeftIcon, Building2Icon, ShieldCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSidebar, type NavGroup } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_admin")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (!context.me.isSuperAdmin) throw redirect({ to: "/" });
	},
	staticData: { crumbKey: "role.admin" },
	component: AdminShell,
});

const baseNav: NavGroup[] = [
	{
		labelKey: "nav.platform",
		items: [{ labelKey: "nav.tenants", to: "/tenants", icon: Building2Icon }],
	},
];

function AdminShell() {
	const { t } = useTranslation();
	const me = Route.useRouteContext().me;
	const hasOwnerTenant = me?.memberships.some((m) => m.role === "OWNER");
	const nav: NavGroup[] = hasOwnerTenant
		? [
				...baseNav,
				{
					labelKey: "nav.workspace",
					items: [{ labelKey: "nav.backToOwner", to: "/owner", icon: ArrowLeftIcon }],
				},
			]
		: baseNav;
	return (
		<SidebarProvider>
			<AppSidebar brand="ERP" subtitle={t("role.admin")} groups={nav} me={me} />
			<SidebarInset>
				<AppTopbar />
				<main className="flex-1 p-4 md:p-6">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
						<ShieldCheckIcon className="size-3.5" /> {t("role.superAdminMode")}
					</div>
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
