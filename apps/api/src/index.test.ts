import { describe, expect, it } from "bun:test";
import { HealthSchema } from "@repo/validators";
import { app } from "./index.js";

describe("GET /health", () => {
	it("returns the health shape", async () => {
		const res = await app.handle(new Request("http://localhost/health"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(HealthSchema.parse(body)).toEqual({ ok: true });
	});
});
