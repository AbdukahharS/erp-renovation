import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
	BuildingIcon,
	ClipboardListIcon,
	LayoutDashboardIcon,
	SettingsIcon,
	ShieldCheckIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { AppSidebar, type NavGroup } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/owner")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "OWNER") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	staticData: { crumbKey: "role.owner" },
	component: OwnerShell,
});

const baseNav: NavGroup[] = [
	{
		labelKey: "nav.operations",
		items: [
			{ labelKey: "nav.dashboard", to: "/owner", icon: LayoutDashboardIcon },
			{ labelKey: "nav.properties", to: "/owner/properties", icon: BuildingIcon },
			{ labelKey: "nav.templates", to: "/owner/templates", icon: ClipboardListIcon },
			{ labelKey: "nav.masters", to: "/owner/masters", icon: UsersIcon },
		],
	},
	{
		labelKey: "nav.money",
		items: [{ labelKey: "nav.finance", to: "/owner/finance", icon: WalletIcon }],
	},
	{
		labelKey: "nav.settingsGroup",
		items: [{ labelKey: "nav.settings", to: "/owner/settings", icon: SettingsIcon }],
	},
];

const adminGroup: NavGroup = {
	labelKey: "nav.platform",
	items: [{ labelKey: "nav.superAdmin", to: "/tenants", icon: ShieldCheckIcon }],
};

function OwnerShell() {
	const me = Route.useRouteContext().me;
	const tenantName = me?.memberships.find((m) => m.tenantId === me.activeTenantId)?.tenantName;
	const nav = me?.isSuperAdmin ? [...baseNav, adminGroup] : baseNav;
	return (
		<SidebarProvider>
			<AppSidebar brand="ERP" subtitle={tenantName} groups={nav} me={me} />
			<SidebarInset>
				<AppTopbar />
				<main className="flex-1 p-4 md:p-6">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
