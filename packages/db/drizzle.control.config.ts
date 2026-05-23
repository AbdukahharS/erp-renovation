import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/control.ts",
	out: "./drizzle/control",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
	schemaFilter: ["public"],
});
