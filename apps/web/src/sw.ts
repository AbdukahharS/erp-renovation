/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

/**
 * Phase 8 service worker. injectManifest mode — Workbox precache is injected
 * at build time via `self.__WB_MANIFEST`, and we own the `push` /
 * `notificationclick` handlers below for Web Push delivery.
 *
 * Payload contract (kept under 4KB and PII-free per Phase 8 §8.4):
 *   { title: string, body: string, url: string, notificationId: string }
 */
declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
	if (!event.data) return;
	let payload: { title?: string; body?: string; url?: string; notificationId?: string } = {};
	try {
		payload = event.data.json();
	} catch {
		payload = { title: "Notification", body: event.data.text() };
	}
	const title = payload.title ?? "Notification";
	// `renotify` is in the spec but missing from the lib.dom NotificationOptions
	// type — cast through to keep the behavior without losing TypeScript.
	const options = {
		body: payload.body ?? "",
		data: { url: payload.url ?? "/", notificationId: payload.notificationId },
		icon: "/favicon.svg",
		badge: "/favicon.svg",
		tag: payload.notificationId,
		renotify: true,
	} as NotificationOptions;
	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const data = event.notification.data as { url?: string } | undefined;
	const target = data?.url ?? "/";
	event.waitUntil(
		(async () => {
			const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of all) {
				try {
					await client.focus();
					await client.navigate(new URL(target, self.location.origin).toString());
					return;
				} catch {
					// fall through to openWindow
				}
			}
			await self.clients.openWindow(target);
		})(),
	);
});

self.addEventListener("message", (event) => {
	if (event.data === "SKIP_WAITING") {
		self.skipWaiting();
	}
});
