import { Elysia } from "elysia";
import { tenancy } from "../tenancy/plugin.ts";
import { attachSocket, detachSocket, type TenantSocket } from "./broadcast.ts";

/**
 * Phase 8 WebSocket route. Uses Elysia's built-in `ws` (runs on Bun's native
 * server WebSocket — no `ws`/`uWebSockets` dep). Handshake auth is delegated
 * to the `tenancy` plugin so the same `tenant` derivation drives both REST
 * and WS — no parallel auth path means no parallel auth bug.
 *
 * Each open socket registers itself under its tenant schema; the broadcast
 * module pumps Redis pub/sub messages into the matching set on the local
 * process. A socket without a resolved tenant is closed immediately.
 */
export const realtimeRoutes = new Elysia().use(tenancy).ws("/tenant/realtime", {
	open(ws) {
		const tenant = (ws.data as { tenant?: { schemaName: string } | null }).tenant;
		if (!tenant) {
			ws.send(JSON.stringify({ kind: "ERROR", code: "no-tenant" }));
			ws.close();
			return;
		}
		const socket: TenantSocket = {
			send: (data) => ws.send(data),
		};
		(ws.data as { _tenantSocket?: TenantSocket })._tenantSocket = socket;
		(ws.data as { _tenantSchema?: string })._tenantSchema = tenant.schemaName;
		attachSocket(tenant.schemaName, socket);
		ws.send(JSON.stringify({ kind: "HELLO", tenantSchema: tenant.schemaName }));
	},
	close(ws) {
		const schema = (ws.data as { _tenantSchema?: string })._tenantSchema;
		const socket = (ws.data as { _tenantSocket?: TenantSocket })._tenantSocket;
		if (schema && socket) {
			detachSocket(schema, socket);
		}
	},
	message(ws, message) {
		// Client→server messages aren't part of the protocol today; just echo
		// a pong for keepalives so the browser can detect a half-open socket.
		if (message === "ping") {
			ws.send("pong");
		}
	},
});
