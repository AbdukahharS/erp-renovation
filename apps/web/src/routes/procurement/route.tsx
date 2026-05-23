import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/procurement")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.activeRole !== "PROCUREMENT") {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	component: ProcurementShell,
});

function ProcurementShell() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b px-4 py-3 text-base font-semibold">Procurement</header>
			<main className="p-4">
				<Outlet />
			</main>
		</div>
	);
}
