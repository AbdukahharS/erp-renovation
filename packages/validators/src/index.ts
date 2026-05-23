import { z } from "zod";

export const HealthSchema = z.object({
	ok: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;

export * from "./auth.ts";
export * from "./elysia.ts";
export * from "./templates.ts";
