import { cors } from "@elysiajs/cors";
import { HealthSchema } from "@repo/validators";
import { Elysia } from "elysia";

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

export const app = new Elysia()
	.use(cors({ origin: corsOrigins, credentials: true }))
	.get("/health", () => HealthSchema.parse({ ok: true }));

export type App = typeof app;

if (import.meta.main) {
	app.listen(3001);
	console.log(`API listening on http://localhost:${app.server?.port}`);
}
