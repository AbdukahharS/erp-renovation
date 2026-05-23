import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/master")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "MASTER") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	component: MasterShell,
});

function MasterShell() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b px-4 py-3 text-base font-semibold">Master</header>
			<main className="p-4 space-y-4 text-base">
				<Outlet />
			</main>
		</div>
	);
}
