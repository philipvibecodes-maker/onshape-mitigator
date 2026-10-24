import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	workers: 2,
	use: {
		baseURL: "http://127.0.0.1:4173",
		launchOptions: {
			executablePath:
				process.env.CHROME_PATH ||
				(existsSync("/usr/bin/google-chrome")
					? "/usr/bin/google-chrome"
					: undefined),
			args: ["--no-sandbox"],
		},
	},
	webServer: {
		command: "npx vite --config tests/fixture/vite.config.mts",
		url: "http://127.0.0.1:4173/tests/fixture/",
		reuseExistingServer: !process.env.CI,
	},
});
