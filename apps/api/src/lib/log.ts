/**
 * Phase 9 structured logger. JSON-per-line so Logtail/Loki ingest
 * cleanly. Drop-in for the limited cases where bare `console.*` was scattered
 * across critical paths (provisioning, fan-out, isolation guards, errors).
 *
 * Intentionally tiny — no pino/winston dependency, no transports. The
 * ERROR_REPORTER_URL hook (see reportError) handles upstream forwarding.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
	const line = JSON.stringify({
		ts: new Date().toISOString(),
		level,
		msg,
		...ctx,
	});
	if (level === "error") console.error(line);
	else console.log(line);
}

export const log = {
	debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
	info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
	warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
	error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

/**
 * Fire-and-forget error webhook. Configure ERROR_REPORTER_URL to a Sentry/
 * Logtail/Slack webhook to receive an alert per uncaught error. No retries
 * — local logs are the durable record.
 */
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
			service: ctx?.service ?? "api",
			message,
			stack,
			ts: new Date().toISOString(),
			ctx,
		}),
	}).catch(() => {
		/* swallow — logs are the source of truth */
	});
}
