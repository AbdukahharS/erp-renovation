import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginInput, LoginSchema } from "@repo/validators";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	const [submitError, setSubmitError] = useState<string | null>(null);
	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

	const onSubmit = async (values: LoginInput) => {
		setSubmitError(null);
		try {
			const result = await signIn.email({ email: values.email, password: values.password });
			if (result.error) {
				setSubmitError(result.error.message ?? "sign-in failed");
				return;
			}
			const me = await fetchMe();
			if (!me?.user) {
				setSubmitError("session lost after login");
				return;
			}
			let role = me.activeRole;
			if (!me.activeTenantId && me.memberships[0]) {
				const switched = await switchTenant(me.memberships[0].tenantId);
				role = switched.role;
			}
			// Hard navigate so the new auth cookie is picked up by __root's
			// beforeLoad on the next page load. Router-level navigation races
			// the cookie write and silently fails to redirect.
			window.location.assign(roleHomePath(role));
		} catch (e) {
			setSubmitError((e as Error).message ?? "sign-in failed");
		}
	};

	return (
		<main className="min-h-screen grid place-items-center bg-muted/30 p-6">
			<div className="w-full max-w-sm space-y-6">
				<div className="flex flex-col items-center gap-2">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
						E
					</div>
					<div className="text-center">
						<h1 className="text-xl font-semibold">Welcome back</h1>
						<p className="text-sm text-muted-foreground">Sign in to your tenant.</p>
					</div>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Sign in</CardTitle>
						<CardDescription>Use the email and password your owner gave you.</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input id="email" type="email" autoComplete="email" {...register("email")} />
								{errors.email ? (
									<p className="text-xs text-destructive">{errors.email.message}</p>
								) : null}
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									autoComplete="current-password"
									{...register("password")}
								/>
								{errors.password ? (
									<p className="text-xs text-destructive">{errors.password.message}</p>
								) : null}
							</div>
							{submitError ? (
								<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
									{submitError}
								</div>
							) : null}
							<Button type="submit" disabled={isSubmitting} className="w-full">
								{isSubmitting ? "Signing in…" : "Sign in"}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
