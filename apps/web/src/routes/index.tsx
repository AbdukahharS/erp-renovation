import { createFileRoute, redirect } from "@tanstack/react-router";
import { roleHomePath } from "@/lib/auth";

export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		if (!context.me?.user) throw redirect({ to: "/login" });
		if (context.me.isSuperAdmin && !context.me.activeRole) throw redirect({ to: "/tenants" });
		throw redirect({ to: roleHomePath(context.me.activeRole) });
	},
});
