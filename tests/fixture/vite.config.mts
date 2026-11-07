import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve("src"),
			"webextension-polyfill": path.resolve("tests/fixture/browser.ts"),
		},
	},
	server: { host: "127.0.0.1", port: 4173, strictPort: true },
});
