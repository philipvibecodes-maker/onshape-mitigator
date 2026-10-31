import { browserPath } from "./tests/browser-path";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/e2e",
  fullyParallel: true,
  workers: 2,
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath: browserPath,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --config tests/fixture/vite.config.mts",
    url: "http://127.0.0.1:4173/tests/fixture/",
    reuseExistingServer: !process.env.CI,
  },
});
