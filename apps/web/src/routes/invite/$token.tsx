import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
	const { token } = Route.useParams();
	const router = useRouter();
	const queryClient = useQueryClient();
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
				setError(signed.error.message ?? t("invite.signupFailed"));
				return;
			}
			await switchTenant(result.tenantId);
			const me = await fetchMe();
			queryClient.setQueryData(["me"], me);
			await router.invalidate();
			await router.navigate({ to: roleHomePath(me?.activeRole ?? null) });
		} catch (e) {
			setError((e as Error).message);
		}
	}

	if (preview.isLoading) {
		return <main className="grid min-h-screen place-items-center p-6">{t("invite.loading")}</main>;
	}
	// Server returns 404 for unknown / expired / consumed tokens alike to avoid
	// leaking tenant identity. The redeem endpoint still gives a precise error.
	if (preview.isError || !preview.data) {
		return (
			<main className="grid min-h-screen place-items-center p-6">
				<Card className="max-w-md p-6 text-sm">{t("invite.notFound")}</Card>
			</main>
		);
	}

	const isMaster = preview.data.role === "MASTER";

	return (
		<main className="grid min-h-screen place-items-center p-6">
			<Card className="w-full max-w-md space-y-4 p-6">
				<header className="space-y-1">
					<h1 className="text-2xl font-semibold">
						{t("invite.joinTitle", { tenant: preview.data.tenantName })}
					</h1>
					<p className="text-sm text-muted-foreground">
						<Trans
							i18nKey="invite.invitedAs"
							values={{ role: preview.data.role }}
							components={{ strong: <strong /> }}
						/>
					</p>
				</header>

				<div className="space-y-1.5">
					<Label>{t("invite.fullName")}</Label>
					<Input
						value={form.name}
						onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>{t("invite.emailLabel")}</Label>
					<Input
						type="email"
						value={form.email}
						onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>{t("invite.passwordLabel")}</Label>
					<Input
						type="password"
						value={form.password}
						onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
					/>
				</div>

				{isMaster && (
					<>
						<div className="space-y-1.5">
							<Label>{t("invite.phoneLabel")}</Label>
							<Input
								value={form.phone}
								onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>{t("invite.specsLabel")}</Label>
							<Input
								value={form.specializations}
								onChange={(e) => setForm((f) => ({ ...f, specializations: e.target.value }))}
								placeholder={t("invite.specsPlaceholder")}
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
					{redeem.isPending ? t("invite.joining") : t("invite.join")}
				</Button>
			</Card>
		</main>
	);
}
