import { z } from "zod";
import zodEnLocale from "zod/v4/locales/en.js";
import zodRuLocale from "zod/v4/locales/ru.js";
import zodUzLocale from "zod/v4/locales/uz.js";

export { z } from "zod";

export const zodLocales = {
	en: zodEnLocale,
	ru: zodRuLocale,
	uz: zodUzLocale,
} as const;

export const HealthSchema = z.object({
	ok: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;

export * from "./auth.ts";
export * from "./elysia.ts";
export * from "./finance.ts";
export * from "./hr.ts";
export * from "./notifications.ts";
export * from "./properties.ts";
export * from "./templates.ts";
