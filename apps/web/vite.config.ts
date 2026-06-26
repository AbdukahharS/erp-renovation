import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	envDir: path.resolve(__dirname, "../.."),
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	plugins: [
		TanStackRouterVite({
			routesDirectory: "./src/routes",
			generatedRouteTree: "./src/routeTree.gen.ts",
		}),
		react(),
		tailwindcss(),
		VitePWA({
			registerType: "autoUpdate",
			// Phase 8: switch from GenerateSW to injectManifest so we can own
			// the `push` and `notificationclick` handlers (Workbox precaching
			// still injected via `precacheAndRoute` in src/sw.ts).
			strategies: "injectManifest",
			srcDir: "src",
			filename: "sw.ts",
			injectManifest: {
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
			// Register the SW in dev so Chrome's installability heuristic sees
			// it (without this the install affordance only appears after
			// `vite build`/`vite preview`).
			devOptions: { enabled: true, type: "module" },
			manifest: {
				name: "Ochag",
				short_name: "Ochag",
				description: "Assembly-line ERP for apartment renovation",
				theme_color: "#0f172a",
				background_color: "#ffffff",
				display: "standalone",
				start_url: "/",
				// Chrome's install prompt requires icons. The bundled SVG works
				// (since Chrome 93) with `sizes: "any"`; the maskable copy
				// makes Android home-screen icons render with safe insets.
				icons: [
					{ src: "/logo.png", sizes: "239x239", type: "image/png" },
					{
						src: "/logo.png",
						sizes: "239x239",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
		}),
	],
	server: { port: 3000 },
});
