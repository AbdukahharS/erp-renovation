import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_admin")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (!context.me.isSuperAdmin) throw redirect({ to: "/" });
	},
	component: AdminShell,
});

function AdminShell() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b px-6 py-3 flex items-center justify-between">
				<div className="text-sm font-semibold">ERP — Super Admin</div>
				<nav className="flex gap-4 text-sm">
					<Link to="/tenants" className="underline">
						Tenants
					</Link>
				</nav>
			</header>
			<main className="p-6">
				<Outlet />
			</main>
		</div>
	);
}
