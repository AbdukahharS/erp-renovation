import type { z } from "zod";
import { z as zod } from "zod";

/**
 * Adapter: convert a Zod schema to a JSON Schema suitable for Elysia's
 * `t.Unsafe<T>(jsonSchema)`. This keeps Zod as the single source of runtime
 * truth (per docs/README §6) while restoring Eden Treaty type flow that
 * `body: t.Any()` previously broke.
 *
 * Usage in an Elysia route:
 *   import { t } from "elysia";
 *   import { toJsonSchema, MySchema } from "@repo/validators";
 *   .post("/x", h, { body: t.Unsafe<z.infer<typeof MySchema>>(toJsonSchema(MySchema)) })
 *
 * The cast on `t.Unsafe<T>(...)` is what gives Eden the inferred body type on
 * the client. Server-side, the handler can still call `MySchema.safeParse(body)`
 * if it wants the richer Zod error path.
 */
export function toJsonSchema<T extends z.ZodType>(schema: T): Record<string, unknown> {
	return zod.toJSONSchema(schema) as Record<string, unknown>;
}
