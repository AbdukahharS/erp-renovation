import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchMe, roleHomePath, signIn, switchTenant } from "@/lib/auth";
import { useInvitationPreview, useRedeemInvitation } from "@/lib/queries/hr";

export const Route = createFileRoute("/invite/$token")({
	component: RedeemInvite,
});

function RedeemInvite() {
	const { token } = Route.useParams();
	const router = useRouter();
	const preview = useInvitationPreview(token);
	const redeem = useRedeemInvitation();

	const [form, setForm] = useState({
		name: "",
		email: "",
		password: "",
		phone: "",
		specializations: "",
	});
	const [error, setError] = useState<string | null>(null);

	async function submit() {
		setError(null);
		try {
			const result = await redeem.mutateAsync({
				token,
				name: form.name.trim(),
				email: form.email.trim(),
				password: form.password,
				phone: form.phone.trim() || undefined,
				specializations: form.specializations
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			// Sign in with the credentials we just created.
			const signed = await signIn.email({ email: form.email, password: form.password });
			if (signed.error) {
				setError(signed.error.message ?? "signed up but sign-in failed");
				return;
			}
			await switchTenant(result.tenantId);
			const me = await fetchMe();
			await router.invalidate();
			await router.navigate({ to: roleHomePath(me?.activeRole ?? null) });
		} catch (e) {
			setError((e as Error).message);
		}
	}

	if (preview.isLoading) {
		return <main className="grid min-h-screen place-items-center p-6">loading…</main>;
	}
	// Server returns 404 for unknown / expired / consumed tokens alike to avoid
	// leaking tenant identity. The redeem endpoint still gives a precise error.
	if (preview.isError || !preview.data) {
		return (
			<main className="grid min-h-screen place-items-center p-6">
				<Card className="max-w-md p-6 text-sm">Invitation not found.</Card>
			</main>
		);
	}

	const isMaster = preview.data.role === "MASTER";

	return (
		<main className="grid min-h-screen place-items-center p-6">
			<Card className="w-full max-w-md space-y-4 p-6">
				<header className="space-y-1">
					<h1 className="text-2xl font-semibold">Join {preview.data.tenantName}</h1>
					<p className="text-sm text-muted-foreground">
						You've been invited as a <strong>{preview.data.role}</strong>.
					</p>
				</header>

				<div className="space-y-1.5">
					<Label>Full name</Label>
					<Input
						value={form.name}
						onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Email</Label>
					<Input
						type="email"
						value={form.email}
						onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Password (min 8)</Label>
					<Input
						type="password"
						value={form.password}
						onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
					/>
				</div>

				{isMaster && (
					<>
						<div className="space-y-1.5">
							<Label>Phone (optional)</Label>
							<Input
								value={form.phone}
								onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Specializations (comma-separated)</Label>
							<Input
								value={form.specializations}
								onChange={(e) => setForm((f) => ({ ...f, specializations: e.target.value }))}
								placeholder="electrician, tiler"
							/>
						</div>
					</>
				)}

				{error && <p className="text-sm text-destructive">{error}</p>}
				<Button
					className="w-full"
					onClick={submit}
					disabled={
						redeem.isPending || !form.name.trim() || !form.email.trim() || form.password.length < 8
					}
				>
					{redeem.isPending ? "Joining…" : "Join"}
				</Button>
			</Card>
		</main>
	);
}
