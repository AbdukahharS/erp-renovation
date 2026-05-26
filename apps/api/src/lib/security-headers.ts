import { Elysia } from "elysia";

/**
 * Phase 9 helmet-equivalent. Six headers cover the basics: HSTS, sniff
 * protection, referrer leak, framing, XSS reflection blockers, and a tight
 * CSP for the API (the web app sets its own via Vite/index.html).
 *
 * No third-party dep — Elysia's onAfterHandle is enough.
 */
export const securityHeaders = new Elysia({ name: "security-headers" }).onAfterHandle(({ set }) => {
	const h = set.headers;
	h["strict-transport-security"] = "max-age=31536000; includeSubDomains";
	h["x-content-type-options"] = "nosniff";
	h["referrer-policy"] = "strict-origin-when-cross-origin";
	h["x-frame-options"] = "DENY";
	h["x-xss-protection"] = "0";
	// API CSP: deny everything; the API doesn't serve HTML.
	h["content-security-policy"] = "default-src 'none'; frame-ancestors 'none'";
});
