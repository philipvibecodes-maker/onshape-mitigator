import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve("src"),
			"webextension-polyfill": path.resolve("tests/fixture/browser.ts"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/unit/**/*.test.tsx"],
		restoreMocks: true,
	},
});
