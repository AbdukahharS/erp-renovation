import { Elysia } from "elysia";

export const app = new Elysia().get("/", () => ({ ok: true }));

export type App = typeof app;

if (import.meta.main) {
	app.listen(3001);
	console.log(`API listening on http://localhost:${app.server?.port}`);
}
