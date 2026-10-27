import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: ".",
	timeout: 45_000,
	workers: 1,
	outputDir: "../../test-results/extension",
});
