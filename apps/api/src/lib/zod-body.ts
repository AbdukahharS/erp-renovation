import { toJsonSchema } from "@repo/validators";
import { type TSchema, t } from "elysia";
import type { z } from "zod";

/**
 * Convert a Zod schema into an Elysia `body:` TypeBox schema.
 *
 * Path: Zod -> JSON Schema (Zod 4 native) -> TypeBox (recursive walk below).
 * Keeps Zod as the single source of runtime truth (docs/README §6) while
 * restoring Eden Treaty type flow for the web client — Eden infers the body
 * type from this TypeBox schema. Server-side validation is now done by Elysia
 * directly; handlers no longer need a defensive `safeParse`.
 *
 * Supports the subset we use: object, string, integer, number, boolean, enum,
 * array, nullable. Anything else falls back to `t.Any()` which is type-safe
 * but skips runtime validation; widen this if new shapes appear.
 */
// biome-ignore lint/suspicious/noExplicitAny: JSON Schema input is intentionally untyped
function jsonToTypeBox(schema: any): TSchema {
	if (!schema || typeof schema !== "object") return t.Any();
	if (Array.isArray(schema.type)) {
		const nonNull = schema.type.filter((x: string) => x !== "null");
		const isNullable = schema.type.includes("null");
		const inner = jsonToTypeBox({
			...schema,
			type: nonNull.length === 1 ? nonNull[0] : nonNull,
		});
		return isNullable ? t.Union([inner, t.Null()]) : inner;
	}
	if (schema.enum && Array.isArray(schema.enum)) {
		if (schema.enum.length === 1) return t.Literal(schema.enum[0]);
		return t.Union(schema.enum.map((v: unknown) => t.Literal(v as never)));
	}
	switch (schema.type) {
		case "object": {
			const props: Record<string, TSchema> = {};
			const required: string[] = schema.required ?? [];
			for (const [k, v] of Object.entries(schema.properties ?? {})) {
				const child = jsonToTypeBox(v);
				props[k] = required.includes(k) ? child : t.Optional(child);
			}
			return t.Object(props, { additionalProperties: schema.additionalProperties ?? false });
		}
		case "array":
			return t.Array(jsonToTypeBox(schema.items ?? {}));
		case "string": {
			const opts: Record<string, unknown> = {};
			if (typeof schema.minLength === "number") opts.minLength = schema.minLength;
			if (typeof schema.maxLength === "number") opts.maxLength = schema.maxLength;
			if (typeof schema.pattern === "string") opts.pattern = schema.pattern;
			if (typeof schema.format === "string") opts.format = schema.format;
			return t.String(opts);
		}
		case "integer":
			return t.Integer();
		case "number":
			return t.Number();
		case "boolean":
			return t.Boolean();
		case "null":
			return t.Null();
		default:
			return t.Any();
	}
}

/**
 * Returns a TypeBox `body:` schema derived from the given Zod schema, typed as
 * the Zod schema's inferred input type. Use directly in route options.
 */
export function zodBody<T extends z.ZodType>(schema: T) {
	return jsonToTypeBox(toJsonSchema(schema)) as TSchema & { static: z.input<T> };
}
