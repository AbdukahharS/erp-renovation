import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/tenant.ts",
	out: "./drizzle/tenant",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});
