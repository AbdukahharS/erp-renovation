import { createFileRoute, Link } from "@tanstack/react-router";
import { CopyIcon, Link2OffIcon, RotateCcwIcon, ShareIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	type CreateShareLinkResponse,
	type PropertyShareLink,
	useCreateShareLink,
	usePropertyShareLinks,
	useRevokeShareLink,
	useRotateShareLinkPassword,
} from "@/lib/queries/property-share-links";

export const Route = createFileRoute("/owner/properties/$propertyId/share")({
	component: ShareLinkManager,
});

function ShareLinkManager() {
	const { t } = useTranslation();
	const { propertyId } = Route.useParams();
	const { data: links, isLoading } = usePropertyShareLinks(propertyId);
	const createLink = useCreateShareLink(propertyId);
	const rotate = useRotateShareLinkPassword(propertyId);
	const revoke = useRevokeShareLink(propertyId);

	const [createOpen, setCreateOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [revealedSecret, setRevealedSecret] = useState<{
		url: string;
		password: string;
	} | null>(null);

	const [rotateTarget, setRotateTarget] = useState<PropertyShareLink | null>(null);
	const [rotatePassword, setRotatePassword] = useState("");

	function copyText(value: string, label: string) {
		navigator.clipboard
			.writeText(value)
			.then(() =>
				toast.success(t("share.copied", { item: label, defaultValue: `${label} copied` })),
			)
			.catch(() => toast.error(t("share.copyFailed", "Could not copy to clipboard")));
	}

	async function onCreate(e: React.FormEvent) {
		e.preventDefault();
		if (password.length < 6) {
			toast.error(t("share.passwordTooShort", "Password must be at least 6 characters"));
			return;
		}
		if (password !== confirmPassword) {
			toast.error(t("share.passwordMismatch", "Passwords do not match"));
			return;
		}
		const result = (await createLink.mutateAsync(password)) as CreateShareLinkResponse;
		setRevealedSecret({ url: result.url, password });
		setCreateOpen(false);
		setPassword("");
		setConfirmPassword("");
	}

	async function onRotate(e: React.FormEvent) {
		e.preventDefault();
		if (!rotateTarget) return;
		if (rotatePassword.length < 6) {
			toast.error(t("share.passwordTooShort", "Password must be at least 6 characters"));
			return;
		}
		await rotate.mutateAsync({ linkId: rotateTarget.id, password: rotatePassword });
		setRevealedSecret({
			url: rotateTarget.url,
			password: rotatePassword,
		});
		setRotateTarget(null);
		setRotatePassword("");
		toast.success(t("share.passwordRotated", "Password updated"));
	}

	async function onRevoke(link: PropertyShareLink) {
		await revoke.mutateAsync(link.id);
		toast.success(t("share.linkRevoked", "Link revoked"));
	}

	return (
		<section className="space-y-6">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Link
							to="/owner/properties/$propertyId"
							params={{ propertyId }}
							className="hover:underline"
						>
							{t("share.backToProperty", "Back to property")}
						</Link>
					</div>
					<h1 className="text-2xl font-semibold">{t("share.title", "Customer progress link")}</h1>
					<p className="text-sm text-muted-foreground">
						{t(
							"share.subtitle",
							"Generate a private link with a password so customers can follow construction progress. No financial information is shown.",
						)}
					</p>
				</div>
				<Button type="button" onClick={() => setCreateOpen(true)}>
					<ShareIcon className="size-4" />
					{t("share.createLink", "New link")}
				</Button>
			</header>

			{revealedSecret && (
				<div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
					<h2 className="text-sm font-semibold">
						{t("share.saveTheseNow", "Save these now — the password won't be shown again")}
					</h2>
					<div className="space-y-2">
						<div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
								{t("share.url", "URL")}
							</div>
							<div className="flex items-center gap-2">
								<code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">
									{revealedSecret.url}
								</code>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => copyText(revealedSecret.url, t("share.url", "URL"))}
								>
									<CopyIcon className="size-3.5" />
								</Button>
							</div>
						</div>
						<div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
								{t("share.password", "Password")}
							</div>
							<div className="flex items-center gap-2">
								<code className="flex-1 rounded bg-background px-2 py-1 text-xs">
									{revealedSecret.password}
								</code>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => copyText(revealedSecret.password, t("share.password", "Password"))}
								>
									<CopyIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					</div>
					<Button type="button" size="sm" variant="ghost" onClick={() => setRevealedSecret(null)}>
						{t("share.dismiss", "Dismiss")}
					</Button>
				</div>
			)}

			<div className="space-y-2">
				<h2 className="text-sm font-semibold">{t("share.existingLinks", "Existing links")}</h2>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">{t("common.loadingShort")}</p>
				) : !links || links.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("share.noLinks", "No links yet")}</p>
				) : (
					<ul className="divide-y rounded-md border">
						{links.map((link) => {
							const url = link.url;
							const revoked = !!link.revokedAt;
							return (
								<li key={link.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
									<div className="min-w-0 space-y-1">
										<div className="flex items-center gap-2">
											<code className="truncate text-xs">{url}</code>
											{revoked && (
												<span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
													{t("share.revoked", "Revoked")}
												</span>
											)}
										</div>
										<div className="text-[11px] text-muted-foreground">
											{t("share.createdAt", "Created")}: {new Date(link.createdAt).toLocaleString()}{" "}
											· {t("share.passwordUpdated", "Password updated")}:{" "}
											{new Date(link.updatedAt).toLocaleString()}
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => copyText(url, t("share.url", "URL"))}
											disabled={revoked}
										>
											<CopyIcon className="size-3.5" />
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => {
												setRotateTarget(link);
												setRotatePassword("");
											}}
											disabled={revoked}
										>
											<RotateCcwIcon className="size-3.5" />
											{t("share.rotate", "Rotate password")}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => onRevoke(link)}
											disabled={revoked}
										>
											<Link2OffIcon className="size-3.5" />
											{t("share.revokeAction", "Revoke")}
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<Dialog
				open={createOpen}
				onOpenChange={(open) => {
					setCreateOpen(open);
					if (!open) {
						setPassword("");
						setConfirmPassword("");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("share.newLinkTitle", "New share link")}</DialogTitle>
						<DialogDescription>
							{t(
								"share.newLinkDescription",
								"Pick a password to give the customer along with the URL.",
							)}
						</DialogDescription>
					</DialogHeader>
					<form className="space-y-3" onSubmit={onCreate}>
						<div className="space-y-1">
							<label className="text-xs font-medium" htmlFor="share-pwd">
								{t("share.password", "Password")}
							</label>
							<input
								id="share-pwd"
								type="text"
								autoComplete="new-password"
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								minLength={6}
								required
							/>
						</div>
						<div className="space-y-1">
							<label className="text-xs font-medium" htmlFor="share-pwd2">
								{t("share.confirmPassword", "Confirm password")}
							</label>
							<input
								id="share-pwd2"
								type="text"
								autoComplete="new-password"
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								minLength={6}
								required
							/>
						</div>
						<DialogFooter>
							<Button type="submit" disabled={createLink.isPending}>
								{t("share.create", "Create link")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!rotateTarget}
				onOpenChange={(open) => {
					if (!open) {
						setRotateTarget(null);
						setRotatePassword("");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("share.rotateTitle", "Rotate password")}</DialogTitle>
						<DialogDescription>
							{t("share.rotateDescription", "All existing customer sessions will be invalidated.")}
						</DialogDescription>
					</DialogHeader>
					<form className="space-y-3" onSubmit={onRotate}>
						<div className="space-y-1">
							<label className="text-xs font-medium" htmlFor="share-rotate-pwd">
								{t("share.newPassword", "New password")}
							</label>
							<input
								id="share-rotate-pwd"
								type="text"
								autoComplete="new-password"
								className="w-full rounded-md border bg-background px-3 py-2 text-sm"
								value={rotatePassword}
								onChange={(e) => setRotatePassword(e.target.value)}
								minLength={6}
								required
							/>
						</div>
						<DialogFooter>
							<Button type="submit" disabled={rotate.isPending}>
								{t("share.rotateConfirm", "Update password")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</section>
	);
}
