import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { isInstallAvailable, onInstallAvailableChange, promptInstall } from "@/lib/install-prompt";
import { ensurePushSubscribed, isIos, isPwaInstalled } from "@/lib/push";

/**
 * First-run nudge for Master / Inspector roles. We can't *force* PWA install
 * (Phase 8 §8.3 risk) — so this card explains the cost of declining ("you
 * won't get pushes") while making the in-app inbox reachable from the bell.
 *
 * Dismissable per session; reappears next session if still incomplete.
 */
const DISMISS_KEY = "notif-install-dismissed";

export function InstallAndPermissionCard() {
	const { t } = useTranslation();
	const [installAvailable, setInstallAvailable] = useState(isInstallAvailable());
	const [installed, setInstalled] = useState(isPwaInstalled());
	const [permission, setPermission] = useState<NotificationPermission>(
		typeof Notification !== "undefined" ? Notification.permission : "default",
	);
	const [dismissed, setDismissed] = useState(() => {
		try {
			return sessionStorage.getItem(DISMISS_KEY) === "1";
		} catch {
			return false;
		}
	});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => onInstallAvailableChange(setInstallAvailable), []);
	useEffect(() => {
		const onChange = () => setInstalled(isPwaInstalled());
		const mq = window.matchMedia?.("(display-mode: standalone)");
		mq?.addEventListener?.("change", onChange);
		return () => mq?.removeEventListener?.("change", onChange);
	}, []);

	const needsInstall = !installed;
	const needsPermission = permission !== "granted";
	if (dismissed || (!needsInstall && !needsPermission)) return null;

	async function handleInstall() {
		setBusy(true);
		setError(null);
		try {
			const outcome = await promptInstall();
			if (outcome === "unavailable") {
				setError(isIos() ? t("installCard.iosInstructions") : t("installCard.installUnavailable"));
			}
		} finally {
			setBusy(false);
		}
	}

	async function handlePermission() {
		setBusy(true);
		setError(null);
		try {
			const result = await ensurePushSubscribed();
			if (!result.ok) {
				setError(t("installCard.pushError", { reason: result.reason }));
			}
			setPermission(typeof Notification !== "undefined" ? Notification.permission : "default");
		} finally {
			setBusy(false);
		}
	}

	function dismiss() {
		try {
			sessionStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// ignore
		}
		setDismissed(true);
	}

	return (
		<div className="rounded-md border bg-card p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-base font-semibold">{t("installCard.title")}</div>
					<div className="mt-1 text-sm text-muted-foreground">{t("installCard.description")}</div>
				</div>
				<button
					type="button"
					className="text-xs text-muted-foreground hover:text-foreground"
					onClick={dismiss}
				>
					{t("common.dismiss")}
				</button>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{needsInstall ? (
					<Button onClick={handleInstall} disabled={busy || (!installAvailable && !isIos())}>
						{installAvailable
							? t("installCard.install")
							: isIos()
								? t("installCard.iosHelp")
								: t("installCard.installFallback")}
					</Button>
				) : null}
				{needsPermission ? (
					<Button variant="outline" onClick={handlePermission} disabled={busy}>
						{t("installCard.enableNotifications")}
					</Button>
				) : null}
			</div>
			{error ? <div className="mt-2 text-xs text-destructive">{error}</div> : null}
		</div>
	);
}
