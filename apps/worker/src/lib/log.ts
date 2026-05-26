/**
 * Phase 9 worker structured logger + error webhook. Mirrors the API logger
 * so both surfaces produce the same JSON-per-line shape for Logtail/Loki.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
	const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx });
	if (level === "error") console.error(line);
	else console.log(line);
}

export const log = {
	debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
	info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
	warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
	error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

export function reportError(err: unknown, ctx?: Record<string, unknown>): void {
	const message = err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error ? err.stack : undefined;
	log.error(message, { stack, ...ctx });
	const url = process.env.ERROR_REPORTER_URL;
	if (!url) return;
	fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			service: ctx?.service ?? "worker",
			message,
			stack,
			ts: new Date().toISOString(),
			ctx,
		}),
	}).catch(() => {
		/* swallow */
	});
}
