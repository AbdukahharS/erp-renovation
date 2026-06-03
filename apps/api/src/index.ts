import { cors } from "@elysiajs/cors";
import { getRedisConnection } from "@repo/queue";
import { HealthSchema } from "@repo/validators";
import { sql as dsql } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "./db.ts";
import { log, reportError } from "./lib/log.ts";
import { DEFAULT_RULES, rateLimitPlugin } from "./lib/rate-limit.ts";
import { securityHeaders } from "./lib/security-headers.ts";
import { wireAcceptanceEnqueuer } from "./modules/acceptance/enqueue.ts";
import { acceptanceRoutes } from "./modules/acceptance/routes.ts";
import { adminRoutes } from "./modules/admin/routes.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { financeRoutes } from "./modules/finance/routes.ts";
import { hrRoutes } from "./modules/hr/routes.ts";
import { invitationsRoutes } from "./modules/invitations/routes.ts";
import { notificationsRoutes } from "./modules/notifications/routes.ts";
import { propertiesRoutes } from "./modules/properties/routes.ts";
import { realtimeRoutes } from "./modules/realtime/routes.ts";
import { templatesRoutes } from "./modules/templates/routes.ts";
import { tenancy } from "./modules/tenancy/plugin.ts";
import { tenantConfigRoutes } from "./modules/tenants/config-routes.ts";
import { tenantRoutes } from "./modules/tenants/routes.ts";
import { warehouseRoutes } from "./modules/warehouse/routes.ts";

// Phase 5: subscribe the BullMQ enqueuer to acceptance events at startup.
wireAcceptanceEnqueuer();

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

export const app = new Elysia()
	.use(cors({ origin: corsOrigins, credentials: true }))
	.use(securityHeaders)
	.use(rateLimitPlugin(DEFAULT_RULES))
	.onError(({ error, code, set }) => {
		// 4xx are caller errors; only forward 5xx + unknown to the reporter.
		const status = typeof set.status === "number" ? set.status : 500;
		if (status >= 500 || code === "UNKNOWN") {
			reportError(error, { service: "api", code, status });
		}
	})
	.get("/health", () => HealthSchema.parse({ ok: true }))
	.get("/ready", async ({ set }) => {
		try {
			await db.execute(dsql`SELECT 1`);
		} catch (err) {
			set.status = 503;
			return { ok: false, db: false, error: (err as Error).message };
		}
		if (process.env.REDIS_URL) {
			try {
				await getRedisConnection().ping();
			} catch (err) {
				set.status = 503;
				return { ok: false, db: true, redis: false, error: (err as Error).message };
			}
		}
		return { ok: true };
	})
	.use(authRoutes)
	.use(tenantRoutes)
	.use(adminRoutes)
	.use(templatesRoutes)
	.use(propertiesRoutes)
	.use(acceptanceRoutes)
	.use(invitationsRoutes)
	.use(hrRoutes)
	.use(financeRoutes)
	.use(warehouseRoutes)
	.use(notificationsRoutes)
	.use(tenantConfigRoutes)
	.use(realtimeRoutes)
	.group("/tenant", (g) =>
		g
			.use(tenancy)
			// Dev/verification: proves the request is operating inside the right schema.
			.get("/whoami", async ({ tenant, runInTenant }) => {
				if (!runInTenant || !tenant) return { error: "no tenant" };
				const result = await runInTenant(async (tx) => {
					const [row] = await tx.execute<{ schema: string }>(
						dsql`SELECT current_schema() AS schema`,
					);
					return row;
				});
				return { tenant, currentSchema: result?.schema };
			})
			// Test-only: insert a marker into the active tenant's schema.
			.post("/marker", async ({ body, runInTenant }) => {
				if (!runInTenant) return { error: "no tenant" };
				const label = (body as { label?: string })?.label ?? "marker";
				return await runInTenant(async (tx) => {
					const rows = await tx.execute<{ id: string; label: string }>(
						dsql`INSERT INTO _tenant_marker (label) VALUES (${label}) RETURNING id, label`,
					);
					return rows[0];
				});
			})
			.get("/markers", async ({ runInTenant }) => {
				if (!runInTenant) return { error: "no tenant" };
				return await runInTenant(async (tx) => {
					const rows = await tx.execute<{ id: string; label: string }>(
						dsql`SELECT id, label FROM _tenant_marker ORDER BY created_at`,
					);
					return rows;
				});
			}),
	);

export type App = typeof app;

if (import.meta.main) {
	const port = Number(process.env.PORT ?? 3001);
	app.listen(port);
	log.info("api.listening", { port: app.server?.port });
}
