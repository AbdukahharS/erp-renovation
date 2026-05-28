import type { QueryClient } from "@tanstack/react-query";
import { apiBaseUrl } from "./api";

/**
 * Phase 8 realtime client. Maintains a single WebSocket per app session,
 * auto-reconnects with bounded backoff, and translates server events into
 * targeted TanStack Query invalidations. Refetch-on-nav (TanStack Query's
 * default) remains the fallback when the socket is down — Phase 8 spec.
 *
 * Tenant scoping is enforced server-side at the handshake (the API binds
 * each socket to the caller's tenant); this client only sees its tenant's
 * events.
 */

type RealtimeEvent =
	| { kind: "HELLO"; tenantSchema: string }
	| { kind: "STAGE_ACCEPTED"; propertyId: string; subStageInstanceId: string }
	| { kind: "FINANCE_CHANGED"; propertyId: string | null; masterUserId: string | null }
	| { kind: "NOTIFICATION_CREATED"; notificationId: string; recipientUserId: string }
	| { kind: "NOTIFICATION_READ"; recipientUserId: string }
	| { kind: "ERROR"; code: string };

let socket: WebSocket | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let stopped = false;

function wsUrl(): string {
	const url = new URL(apiBaseUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	// Preserve any path prefix on apiBaseUrl (e.g. "/api" in prod where Caddy
	// mounts the API at /api). Strip a trailing slash to avoid "//tenant/...".
	const prefix = url.pathname.replace(/\/$/, "");
	url.pathname = `${prefix}/tenant/realtime`;
	return url.toString();
}

export function startRealtime(queryClient: QueryClient): void {
	if (typeof window === "undefined") return;
	stopped = false;
	connect(queryClient);
}

export function stopRealtime(): void {
	stopped = true;
	if (reconnectTimer) clearTimeout(reconnectTimer);
	if (pingTimer) clearInterval(pingTimer);
	reconnectTimer = null;
	pingTimer = null;
	if (socket) {
		try {
			socket.close();
		} catch {
			// ignore
		}
		socket = null;
	}
}

function connect(queryClient: QueryClient): void {
	if (stopped) return;
	try {
		socket = new WebSocket(wsUrl());
	} catch {
		scheduleReconnect(queryClient);
		return;
	}

	socket.addEventListener("open", () => {
		reconnectAttempt = 0;
		if (pingTimer) clearInterval(pingTimer);
		pingTimer = setInterval(() => {
			if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
		}, 30_000);
	});

	socket.addEventListener("message", (event) => {
		if (typeof event.data !== "string") return;
		if (event.data === "pong") return;
		let parsed: RealtimeEvent;
		try {
			parsed = JSON.parse(event.data) as RealtimeEvent;
		} catch {
			return;
		}
		dispatch(parsed, queryClient);
	});

	socket.addEventListener("close", () => {
		if (pingTimer) clearInterval(pingTimer);
		pingTimer = null;
		scheduleReconnect(queryClient);
	});

	socket.addEventListener("error", () => {
		try {
			socket?.close();
		} catch {
			// ignore — close handler will reconnect
		}
	});
}

function scheduleReconnect(queryClient: QueryClient): void {
	if (stopped) return;
	reconnectAttempt += 1;
	const delay = Math.min(30_000, 500 * 2 ** Math.min(reconnectAttempt, 6));
	if (reconnectTimer) clearTimeout(reconnectTimer);
	reconnectTimer = setTimeout(() => connect(queryClient), delay);
}

function dispatch(event: RealtimeEvent, queryClient: QueryClient): void {
	switch (event.kind) {
		case "STAGE_ACCEPTED":
			queryClient.invalidateQueries({ queryKey: ["properties"] });
			queryClient.invalidateQueries({ queryKey: ["property", event.propertyId] });
			queryClient.invalidateQueries({ queryKey: ["acceptance"] });
			queryClient.invalidateQueries({ queryKey: ["finance"] });
			break;
		case "FINANCE_CHANGED":
			queryClient.invalidateQueries({ queryKey: ["finance"] });
			if (event.propertyId) {
				queryClient.invalidateQueries({ queryKey: ["property", event.propertyId, "finance"] });
			}
			if (event.masterUserId) {
				queryClient.invalidateQueries({ queryKey: ["master", event.masterUserId, "balance"] });
			}
			break;
		case "NOTIFICATION_CREATED":
		case "NOTIFICATION_READ":
			// Both events affect every notifications query for the recipient.
			// The server only emits READ to the actor's tenant; the realtime
			// channel is already tenant-scoped, but a single user may be open
			// in two tabs as different roles — invalidating across the board
			// is cheap and avoids missing a cross-tab update.
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
			break;
		default:
			break;
	}
}
