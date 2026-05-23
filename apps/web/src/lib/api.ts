import { treaty } from "@elysiajs/eden";
import type { App } from "api";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = treaty<App>(baseUrl, {
	fetch: { credentials: "include" },
});

export const apiBaseUrl = baseUrl;
