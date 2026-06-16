import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: ["./src/schema/control.ts", "./src/schema/tenant.ts"],
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});
