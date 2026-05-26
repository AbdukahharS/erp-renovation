import { describe, expect, it } from "bun:test";
import { DEFAULT_RULES, rateLimitPlugin } from "../lib/rate-limit.ts";

// The runtime rate-limit is a no-op without REDIS_URL, so the cookie-driven
// integration test is skipped in environments without Redis. The structural
// test below stays valuable always: it pins the rule shape so we notice if
// a rule accidentally drops a path it should cover.

function findRule(name: string) {
	const rule = DEFAULT_RULES.find((r) => r.name === name);
	if (!rule) throw new Error(`missing rule ${name}`);
	return rule;
}

describe("rate-limit rules", () => {
	it("auth rule matches /api/auth/sign-in/email POST", () => {
		const rule = findRule("auth");
		expect(rule.match("/api/auth/sign-in/email", "POST")).toBe(true);
		expect(rule.match("/api/auth/sign-in/email", "GET")).toBe(false);
		expect(rule.match("/health", "POST")).toBe(false);
	});

	it("bootstrap rule matches POST /tenants only", () => {
		const rule = findRule("bootstrap");
		expect(rule.match("/tenants", "POST")).toBe(true);
		expect(rule.match("/admin/tenants", "POST")).toBe(false);
		expect(rule.match("/tenants", "GET")).toBe(false);
	});

	it("presign rule matches any /assets/presign sub-path", () => {
		const rule = findRule("presign");
		expect(rule.match("/owner/properties/abc/assets/presign", "POST")).toBe(true);
		expect(rule.match("/master/stages/xyz/assets/presign", "POST")).toBe(true);
		expect(rule.match("/owner/properties/abc/assets/attach", "POST")).toBe(false);
	});

	it("plugin builds without throwing even with zero rules", () => {
		const p = rateLimitPlugin([]);
		expect(p).toBeDefined();
	});
});
