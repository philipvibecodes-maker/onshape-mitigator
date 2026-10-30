import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
// Prefer Playwright's testing build: a managed system browser may forbid
// unpacked extensions. CHROME_PATH explicitly selects another browser.
export const browserPath =
  process.env.CHROME_PATH ||
  [
    chromium.executablePath(),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find(existsSync);
