import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
			<header className="border-b px-4 py-3 text-base font-semibold">Inspector</header>
			<main className="p-4 space-y-4 text-base">
				<Outlet />
			</main>
		</div>
	);
}
