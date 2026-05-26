import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginInput, LoginSchema } from "@repo/validators";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { fetchMe, roleHomePath, signIn, switchTenant } from "@/lib/auth";

export const Route = createFileRoute("/login")({
	beforeLoad: ({ context }) => {
		if (context.me?.user) {
			throw redirect({ to: roleHomePath(context.me.activeRole) });
		}
	},
	component: Login,
});

function Login() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [submitError, setSubmitError] = useState<string | null>(null);
	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

	const onSubmit = async (values: LoginInput) => {
		setSubmitError(null);
		const result = await signIn.email({ email: values.email, password: values.password });
		if (result.error) {
			setSubmitError(result.error.message ?? "sign-in failed");
			return;
		}
		// On first login, session has no active tenant — auto-pick the first membership.
		const me = await fetchMe();
		if (!me?.user) {
			setSubmitError("session lost after login");
			return;
		}
		if (!me.activeTenantId && me.memberships[0]) {
			const switched = await switchTenant(me.memberships[0].tenantId);
			await queryClient.invalidateQueries({ queryKey: ["me"] });
			await router.invalidate();
			await router.navigate({ to: roleHomePath(switched.role) });
			return;
		}
		queryClient.setQueryData(["me"], me);
		await router.invalidate();
		await router.navigate({ to: roleHomePath(me.activeRole) });
	};

	return (
		<main className="min-h-screen grid place-items-center p-6">
			<form
				onSubmit={handleSubmit(onSubmit)}
				className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"
			>
				<h1 className="text-2xl font-semibold">Sign in</h1>
				<div className="space-y-1.5">
					<label htmlFor="email" className="text-sm font-medium">
						Email
					</label>
					<input
						id="email"
						type="email"
						autoComplete="email"
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
						{...register("email")}
					/>
					{errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
				</div>
				<div className="space-y-1.5">
					<label htmlFor="password" className="text-sm font-medium">
						Password
					</label>
					<input
						id="password"
						type="password"
						autoComplete="current-password"
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
						{...register("password")}
					/>
					{errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
				</div>
				{submitError && <p className="text-sm text-destructive">{submitError}</p>}
				<Button type="submit" disabled={isSubmitting} className="w-full">
					{isSubmitting ? "Signing in…" : "Sign in"}
				</Button>
			</form>
		</main>
	);
}
