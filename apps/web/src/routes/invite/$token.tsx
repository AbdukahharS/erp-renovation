import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SpecializationsPicker } from "@/components/specializations-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
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

	const [form, setForm] = useState<{
		name: string;
		email: string;
		password: string;
		phone: string;
		specializations: string[];
	}>({
		name: "",
		email: "",
		password: "",
		phone: "",
		specializations: [],
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
				specializations: form.specializations,
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

	const controls = (
		<div className="fixed top-4 right-4 z-10 flex items-center gap-2">
			<LanguageSwitcher />
			<ThemeToggle />
		</div>
	);

	if (preview.isLoading) {
		return (
			<main className="relative grid min-h-screen place-items-center p-6">
				{controls}
				{t("invite.loading")}
			</main>
		);
	}
	// Server returns 404 only for unknown tokens. Consumed/expired return 200
	// with a status field so we can render a precise message.
	if (preview.isError || !preview.data) {
		return (
			<main className="relative grid min-h-screen place-items-center p-6">
				{controls}
				<Card className="max-w-md p-6 text-sm">{t("invite.notFound")}</Card>
			</main>
		);
	}
	if (preview.data.status === "CONSUMED" || preview.data.status === "EXPIRED") {
		const titleKey = preview.data.status === "CONSUMED" ? "invite.consumedTitle" : "invite.expiredTitle";
		const bodyKey = preview.data.status === "CONSUMED" ? "invite.consumedBody" : "invite.expiredBody";
		return (
			<main className="relative grid min-h-screen place-items-center p-6">
				{controls}
				<Card className="max-w-md space-y-3 p-6 text-sm">
					<h1 className="text-base font-semibold">{t(titleKey)}</h1>
					<p className="text-muted-foreground">{t(bodyKey)}</p>
					{preview.data.status === "CONSUMED" && (
						<Link to="/login" className={buttonVariants({ className: "w-full" })}>
							{t("invite.signInLink")}
						</Link>
					)}
				</Card>
			</main>
		);
	}

	const isMaster = preview.data.role === "MASTER";

	return (
		<main className="relative grid min-h-screen place-items-center p-6">
			{controls}
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
							<SpecializationsPicker
								value={form.specializations}
								options={preview.data.specializations ?? []}
								onChange={(next) => setForm((f) => ({ ...f, specializations: next }))}
								placeholder={t("invite.specsPlaceholder")}
								emptyHint={t("common.none")}
							/>
						</div>
					</>
				)}

				{error && <p className="text-sm text-destructive">{error}</p>}
				<Button
					className="w-full"
					onClick={submit}
					disabled={
						redeem.isPending || !form.name.trim() || !form.email.trim() || form.password.length < 12
					}
				>
					{redeem.isPending ? t("invite.joining") : t("invite.join")}
				</Button>
			</Card>
		</main>
	);
}
