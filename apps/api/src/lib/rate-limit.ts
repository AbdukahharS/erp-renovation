import { getRedisConnection } from "@repo/queue";
import { Elysia } from "elysia";

/**
 * Phase 9 token-bucket rate limiter backed by Redis. Defines path-matched
 * rules globally so callers don't need to thread plugin scope correctly.
 *
 * Each rule:
 *   - `match(path, method)` decides if this rule applies to a request
 *   - `keyOf(req)` produces the bucket key (per-IP / per-user)
 *   - `limit` requests per `windowSeconds`
 *
 * No-op when REDIS_URL is missing (tests).
 */

export interface RateLimitRule {
	name: string;
	match: (path: string, method: string) => boolean;
	limit: number;
	windowSeconds: number;
	keyOf: (req: { request: Request }) => string;
}

const RATE_PREFIX = "rl:";

/**
 * Resolve the caller's IP. `x-forwarded-for` is appended to by every hop, so
 * the *last* entry is the most-trusted (our edge proxy); the first entry is
 * client-provided and trivially spoofable. We trust the last
 * `TRUSTED_PROXY_HOPS` entries (default 1 = your edge proxy) and read the IP
 * just before them.
 */
export function clientIp(request: Request): string {
	const fwd = request.headers.get("x-forwarded-for");
	if (fwd) {
		const parts = fwd
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? "1"));
		const idx = Math.max(0, parts.length - hops);
		const ip = parts[idx];
		if (ip) return ip;
	}
	const real = request.headers.get("x-real-ip");
	if (real) return real;
	return "unknown";
}

export const ipKey = (req: { request: Request }) => clientIp(req.request);

export function rateLimitPlugin(rules: RateLimitRule[]) {
	return new Elysia({ name: "rate-limit" }).onRequest(async ({ request, set }) => {
		if (!process.env.REDIS_URL) return;
		// Bun's test runner sets NODE_ENV=test; the bootstrap/auth/presign
		// limits are tuned for human use and trip immediately under a test loop.
		if (process.env.NODE_ENV === "test") return;
		const url = new URL(request.url);
		const matched = rules.filter((r) => r.match(url.pathname, request.method));
		if (matched.length === 0) return;
		const redis = getRedisConnection();
		for (const rule of matched) {
			const fullKey = `${RATE_PREFIX}${rule.name}:${rule.keyOf({ request })}`;
			const count = await redis.incr(fullKey);
			if (count === 1) {
				await redis.expire(fullKey, rule.windowSeconds);
			}
			if (count > rule.limit) {
				set.status = 429;
				set.headers["retry-after"] = String(rule.windowSeconds);
				return new Response(JSON.stringify({ error: "rate limit exceeded", rule: rule.name }), {
					status: 429,
					headers: {
						"content-type": "application/json",
						"retry-after": String(rule.windowSeconds),
					},
				});
			}
		}
	});
}

/** Default rules used by the API entry. Tuned to slow brute-force without
 *  blocking legit retries. */
export const DEFAULT_RULES: RateLimitRule[] = [
	// Auth surface: sign-in/sign-up.
	{
		name: "auth",
		match: (p, m) => m === "POST" && p.startsWith("/api/auth/"),
		limit: 10,
		windowSeconds: 60,
		keyOf: ipKey,
	},
	// Bootstrap provisioning (token-gated path).
	{
		name: "bootstrap",
		match: (p, m) => m === "POST" && p === "/tenants",
		limit: 5,
		windowSeconds: 3600,
		keyOf: ipKey,
	},
	// R2 presign endpoints. Matches every module's presign route:
	//   POST /stages/:id/media/presign           (acceptance)
	//   POST /properties/:id/floor-plan/presign  (properties)
	//   POST /properties/:id/portfolio/presign   (finance)
	// Any future presign route must end in `/presign` to be rate-limited.
	{
		name: "presign",
		match: (p, m) => m === "POST" && p.endsWith("/presign"),
		limit: 60,
		windowSeconds: 60,
		keyOf: ipKey,
	},
	// Public share-link password auth. Protects against brute-forcing the
	// owner-set password on customer progress pages.
	{
		name: "share-link-auth",
		match: (p, m) => m === "POST" && /^\/public\/property-share\/[^/]+\/[^/]+\/auth$/.test(p),
		limit: 5,
		windowSeconds: 60,
		keyOf: ipKey,
	},
	// Super-admin export endpoint. Even with auth, a compromised super-admin
	// shouldn't be able to drain tenants in a loop.
	{
		name: "admin-export",
		match: (p, m) => m === "GET" && /^\/admin\/tenants\/[^/]+\/export$/.test(p),
		limit: 5,
		windowSeconds: 3600,
		keyOf: ipKey,
	},
];
