import { cors } from "@elysiajs/cors";
import { HealthSchema } from "@repo/validators";
import { sql as dsql } from "drizzle-orm";
import { Elysia } from "elysia";
import { wireAcceptanceEnqueuer } from "./modules/acceptance/enqueue.ts";
import { acceptanceRoutes } from "./modules/acceptance/routes.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { hrRoutes } from "./modules/hr/routes.ts";
import { invitationsRoutes } from "./modules/invitations/routes.ts";
import { propertiesRoutes } from "./modules/properties/routes.ts";
import { templatesRoutes } from "./modules/templates/routes.ts";
import { tenancy } from "./modules/tenancy/plugin.ts";
import { tenantRoutes } from "./modules/tenants/routes.ts";

// Phase 5: subscribe the BullMQ enqueuer to acceptance events at startup.
wireAcceptanceEnqueuer();

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

export const app = new Elysia()
	.use(cors({ origin: corsOrigins, credentials: true }))
	.get("/health", () => HealthSchema.parse({ ok: true }))
	.use(authRoutes)
	.use(tenantRoutes)
	.use(templatesRoutes)
	.use(propertiesRoutes)
	.use(acceptanceRoutes)
	.use(invitationsRoutes)
	.use(hrRoutes)
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
	console.log(`API listening on http://localhost:${app.server?.port}`);
}
