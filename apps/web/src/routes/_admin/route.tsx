import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ArrowLeftIcon, Building2Icon, ShieldCheckIcon } from "lucide-react";
import { AppSidebar, type NavGroup } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const Route = createFileRoute("/_admin")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (!context.me.isSuperAdmin) throw redirect({ to: "/" });
	},
	staticData: { crumb: "Admin" },
	component: AdminShell,
});

const baseNav: NavGroup[] = [
	{
		label: "Platform",
		items: [{ label: "Tenants", to: "/tenants", icon: Building2Icon }],
	},
];

function AdminShell() {
	const me = Route.useRouteContext().me;
	const hasOwnerTenant = me?.memberships.some((m) => m.role === "OWNER");
	const nav = hasOwnerTenant
		? [
				...baseNav,
				{
					label: "Workspace",
					items: [{ label: "Back to Owner", to: "/owner", icon: ArrowLeftIcon }],
				},
			]
		: baseNav;
	return (
		<SidebarProvider>
			<AppSidebar brand="ERP" subtitle="Super Admin" groups={nav} me={me} />
			<SidebarInset>
				<AppTopbar />
				<main className="flex-1 p-4 md:p-6">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
						<ShieldCheckIcon className="size-3.5" /> Super admin mode
					</div>
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
