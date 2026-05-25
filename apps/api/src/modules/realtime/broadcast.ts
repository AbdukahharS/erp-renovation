import { getRedisConnection, REALTIME_CHANNEL_PREFIX } from "@repo/queue";

// Lazy typing: API doesn't depend on ioredis directly; we only need a couple
// of methods off the duplicated client and type them via the inferred return.
type RedisClient = ReturnType<typeof getRedisConnection>;

/**
 * Phase 8 realtime fan-in. The API process keeps an in-memory
 * `Map<tenantSchema, Set<TenantSocket>>` and subscribes to a single Redis
 * pattern (`tenant-realtime:*`). Worker processes PUBLISH on the per-tenant
 * channel; this module routes the message to the matching local sockets.
 *
 * Tenant scoping is structural — channel names embed the schema, the local
 * map is keyed on schema, and a connection only gets events for its own
 * schema. A bug here can NEVER leak across tenants short of a developer
 * mis-wiring the key (covered by the realtime-isolation test).
 */

export interface TenantSocket {
	send: (data: string) => void;
}

const subscribers = new Map<string, Set<TenantSocket>>();
let patternSubscriber: RedisClient | null = null;
let subscribed = false;

function ensurePatternSubscription(): void {
	if (subscribed) return;
	if (!process.env.REDIS_URL) return;
	// A pattern subscriber MUST be a dedicated client — Redis blocks all other
	// commands on a subscribed connection. The main IORedis singleton stays
	// usable for publishes via duplicate().
	const base = getRedisConnection();
	patternSubscriber = base.duplicate();
	patternSubscriber.psubscribe(`${REALTIME_CHANNEL_PREFIX}*`).catch((err: unknown) => {
		console.error("[realtime:subscribe] psubscribe failed:", err);
	});
	patternSubscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
		const schema = channel.startsWith(REALTIME_CHANNEL_PREFIX)
			? channel.slice(REALTIME_CHANNEL_PREFIX.length)
			: null;
		if (!schema) return;
		const set = subscribers.get(schema);
		if (!set || set.size === 0) return;
		for (const ws of set) {
			try {
				ws.send(message);
			} catch (err) {
				console.error("[realtime:dispatch] send failed:", err);
			}
		}
	});
	subscribed = true;
}

export function attachSocket(tenantSchema: string, ws: TenantSocket): void {
	ensurePatternSubscription();
	let set = subscribers.get(tenantSchema);
	if (!set) {
		set = new Set();
		subscribers.set(tenantSchema, set);
	}
	set.add(ws);
}

export function detachSocket(tenantSchema: string, ws: TenantSocket): void {
	const set = subscribers.get(tenantSchema);
	if (!set) return;
	set.delete(ws);
	if (set.size === 0) subscribers.delete(tenantSchema);
}

/**
 * Test/dev helper: deliver an event directly to local sockets without going
 * through Redis. Production code paths always use `publishToTenant` from
 * `@repo/queue` so the message survives a cross-process worker→API hop.
 */
export function localBroadcastToTenant(tenantSchema: string, event: unknown): void {
	const set = subscribers.get(tenantSchema);
	if (!set || set.size === 0) return;
	const message = JSON.stringify(event);
	for (const ws of set) {
		try {
			ws.send(message);
		} catch (err) {
			console.error("[realtime:localBroadcast] send failed:", err);
		}
	}
}

export function _resetForTests(): void {
	subscribers.clear();
	if (patternSubscriber) {
		patternSubscriber.disconnect();
		patternSubscriber = null;
	}
	subscribed = false;
}
