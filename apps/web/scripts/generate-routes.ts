/**
 * Standalone route-tree generator.
 *
 * Invoked before `tsc` so that `routeTree.gen.ts` exists when the type-checker
 * runs in CI (the file is gitignored; the Vite plugin normally creates it at
 * dev/build time, but `tsc --noEmit` runs before Vite in CI).
 *
 * Usage:  bun run scripts/generate-routes.ts
 */
import { Generator, getConfig } from "@tanstack/router-generator";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

const config = getConfig(
	{
		target: "react",
		routesDirectory: resolve(root, "src/routes"),
		generatedRouteTree: resolve(root, "src/routeTree.gen.ts"),
		quoteStyle: "double",
		semicolons: true,
		disableLogging: true,
	},
	root,
);

const generator = new Generator({ config });

await generator.run();
