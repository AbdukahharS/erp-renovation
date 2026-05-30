import { api } from "./api";
import i18n from "./i18n";

function currentLocale(): "en" | "ru" | "uz" {
	const lng = (i18n.language || "en").split("-")[0] ?? "en";
	return lng === "ru" || lng === "uz" ? lng : "en";
}

/**
 * Phase 8 push subscription helper. Idempotently:
 *   1. Waits for the SW to be ready.
 *   2. Asks for notification permission if not already granted.
 *   3. Subscribes the browser to push using the VAPID key (re-uses an
 *      existing subscription if one is present).
 *   4. POSTs the subscription to the API for delivery binding.
 *
 * Safe to call repeatedly — duplicate subscriptions upsert on the endpoint.
 */
export async function ensurePushSubscribed(): Promise<
	{ ok: true } | { ok: false; reason: string }
> {
	if (typeof window === "undefined") return { ok: false, reason: "no-window" };
	if (!("serviceWorker" in navigator)) return { ok: false, reason: "no-sw" };
	if (!("PushManager" in window)) return { ok: false, reason: "no-push" };
	if (!("Notification" in window)) return { ok: false, reason: "no-notif-api" };

	if (Notification.permission === "denied") {
		return { ok: false, reason: "permission-denied" };
	}
	if (Notification.permission !== "granted") {
		const result = await Notification.requestPermission();
		if (result !== "granted") return { ok: false, reason: "permission-not-granted" };
	}

	const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? (await fetchVapidKeyFromApi());
	if (!vapidKey) return { ok: false, reason: "no-vapid-key" };

	const reg = await navigator.serviceWorker.ready;
	let sub = await reg.pushManager.getSubscription();
	if (!sub) {
		// PushSubscriptionOptionsInit demands a BufferSource backed by ArrayBuffer
		// (not SharedArrayBuffer). Copy into a fresh ArrayBuffer.
		const raw = urlBase64ToUint8Array(vapidKey);
		const buf = new Uint8Array(raw.byteLength);
		buf.set(raw);
		sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: buf as BufferSource,
		});
	}

	const json = sub.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
		return { ok: false, reason: "invalid-subscription" };
	}

	const res = await api.tenant.notifications.subscriptions.post({
		endpoint: json.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
		userAgent: navigator.userAgent.slice(0, 512),
		locale: currentLocale(),
	});
	if (res.error) return { ok: false, reason: `api-error:${res.error.status ?? "?"}` };
	return { ok: true };
}

/**
 * Push the current i18next language to this device's existing push subscription
 * (if any) so the next push lands localized without waiting for the next app
 * load. Silent on missing subscription — call sites just fire-and-forget.
 */
export async function syncCurrentDeviceLocale(locale?: "en" | "ru" | "uz"): Promise<void> {
	if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (!sub) return;
		const endpoint = sub.toJSON().endpoint;
		if (!endpoint) return;
		await api.tenant.notifications.subscriptions.locale.patch({
			endpoint,
			locale: locale ?? currentLocale(),
		});
	} catch {
		// Best effort — a missed sync is corrected on the next app load by
		// ensurePushSubscribed re-upserting with the current locale.
	}
}

async function fetchVapidKeyFromApi(): Promise<string | null> {
	try {
		const res = await api.tenant.notifications["vapid-public-key"].get();
		if (res.error || !res.data) return null;
		return (res.data as { publicKey?: string }).publicKey ?? null;
	} catch {
		return null;
	}
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

export function isPwaInstalled(): boolean {
	if (typeof window === "undefined") return false;
	return (
		window.matchMedia?.("(display-mode: standalone)").matches ||
		(window.navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export function isIos(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
