#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const extensionPath = path.join(repoRoot, "dist");
const onshapeHome = "https://cad.onshape.com";
const documentPattern = /\/documents\/[^/]+\/(?:w|v|m)\/[^/]+\/e\/[^/?#]+/;

function browserExecutable() {
  if (process.env.CHROMIUM_FLATPAK_APP) return null;
  const candidates = [
    process.env.CHROME_PATH,
    chromium.executablePath(),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error("Set CHROME_PATH or install Chromium");
  return executablePath;
}

function usage() {
  console.log(`Usage: npm run test:live -- [options]

Launches Chromium with the built extension, signs in through the saved
onshape.com credential, and opens a live Onshape document.

Options:
  --headed       Show the browser window (default: headless)
  --keep-open    Leave the browser running after setup

Environment:
  CHROME_PATH                  Chromium/Chrome executable override
  CHROMIUM_FLATPAK_APP         Launch Chromium through Flatpak (e.g. org.chromium.Chromium)
  ONSHAPE_PROFILE_DIR          Persistent profile containing saved login
  ONSHAPE_DOCUMENT_URL         Open this document URL instead of the first one
  ONSHAPE_DOCUMENT_NAME        Open a document with this exact visible name
`);
}

function args() {
  const values = new Set(process.argv.slice(2));
  if (values.has("--help") || values.has("-h")) {
    usage();
    process.exit(0);
  }
  return {
    headed: values.has("--headed"),
    keepOpen: values.has("--keep-open"),
  };
}

export async function signInWithSavedLogin(context, page = context.pages().find((candidate) => candidate.url().startsWith(onshapeHome))) {
  const current = page;
  if (!current) throw new Error("No Onshape page is open");
  if (documentPattern.test(current.url())) return current;

  if (current.url().includes("/documents")) {
    await current.waitForLoadState("domcontentloaded");
    const signedIn = await current
      .locator('a[href*="/documents/"][href*="/w/"]')
      .first()
      .isVisible()
      .catch(() => false);
    const signInForm = await current
      .locator('input[name="username"], input[placeholder="Email"], input[type="password"]')
      .count();
    if (signedIn && signInForm === 0) return current;
  }

  if (!current.url().includes("/signin")) await current.goto(`${onshapeHome}/signin`);
  await current.waitForLoadState("domcontentloaded");
  if (documentPattern.test(current.url())) return current;

  const passwordManager = await context.newPage();
  try {
    passwordManager.setDefaultTimeout(10000);
    await passwordManager.goto("chrome://password-manager/passwords");

    const usernameField = passwordManager.locator('input[aria-label="Username"]');
    const passwordField = passwordManager.locator('input[aria-label="Password"]');
    try {
      if ((await usernameField.count()) === 0) {
        await passwordManager.getByText("onshape.com", { exact: true }).click();
      }
      await usernameField.waitFor();
    } catch {
      throw new Error(
        "No saved onshape.com credential found; use an authenticated Chromium profile",
      );
    }
    const username = await usernameField.inputValue();
    await passwordManager.getByRole("button", { name: "Show password" }).click();
    let password;
    try {
      password = await passwordField.inputValue();
    } finally {
      await passwordManager
        .getByRole("button", { name: "Hide password" })
        .click()
        .catch(() => {});
    }

    await current.locator('input[name="username"], input[placeholder="Email"]').fill(username);
    await current.getByRole("button", { name: "Continue" }).click();
    await current.locator('input[type="password"]').fill(password);
    await current.getByRole("button", { name: /sign in/i }).click();
    await current.waitForURL(
      (url) => url.origin === new URL(onshapeHome).origin && !url.pathname.includes("/signin"),
    );
  } finally {
    await passwordManager.close();
  }
  return current;
}

export async function openDocument(page) {
  const requestedUrl = process.env.ONSHAPE_DOCUMENT_URL;
  if (requestedUrl) {
    await page.goto(requestedUrl);
  } else {
    await page.goto(`${onshapeHome}/documents`);
    await page.waitForLoadState("domcontentloaded");
    const requestedName = process.env.ONSHAPE_DOCUMENT_NAME;
    const document = requestedName
      ? page.getByText(requestedName, { exact: true }).first()
      : page.locator('a[href*="/documents/"][href*="/w/"]').first();
    try {
      await document.waitFor({ state: "visible", timeout: 10000 });
    } catch {
      throw new Error(
        "No Onshape document was available. Sign in to an authenticated profile or set ONSHAPE_DOCUMENT_URL to an accessible document.",
      );
    }
    await document.click();
  }
  await page.waitForURL((url) => documentPattern.test(url.pathname));
  await page.waitForSelector("#onshape-extension-host", { state: "attached" });
  await page.waitForTimeout(1500);
  return page;
}

export async function launchOnshapeChromium({ headed = false } = {}) {
  const executablePath = browserExecutable();
  const profileDir = process.env.ONSHAPE_PROFILE_DIR;
  if (!profileDir) {
    throw new Error("Set ONSHAPE_PROFILE_DIR to an authenticated Chromium profile");
  }

  let context;
  let flatpakProcess;
  let flatpakBrowser;
  if (process.env.CHROMIUM_FLATPAK_APP) {
    const port = Number(process.env.CHROMIUM_DEBUG_PORT ?? 9224);
    flatpakProcess = spawn(
      "flatpak",
      [
        "run",
        "--command=chromium",
        process.env.CHROMIUM_FLATPAK_APP,
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-port=${port}`,
        "--remote-debugging-address=127.0.0.1",
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--enable-unsafe-extension-debugging",
        "--password-store=gnome-libsecret",
        ...(headed ? [] : ["--headless=new"]),
        process.env.ONSHAPE_DOCUMENT_URL || `${onshapeHome}/documents`,
      ],
      { stdio: "ignore", env: process.env },
    );
    const endpoint = `http://127.0.0.1:${port}`;
    let lastError;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (flatpakProcess.exitCode !== null)
        throw new Error(`Flatpak Chromium exited with code ${flatpakProcess.exitCode}`);
      try {
        flatpakBrowser = await chromium.connectOverCDP(endpoint);
        break;
      } catch (error) {
        lastError = error;
        await delay(250);
      }
    }
    if (!flatpakBrowser) {
      flatpakProcess.kill("SIGTERM");
      throw new Error(`Could not connect to Flatpak Chromium at ${endpoint}: ${lastError}`);
    }
    context = flatpakBrowser.contexts()[0];
    if (!context) throw new Error("Flatpak Chromium has no default browser context");
  } else {
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: !headed,
      ignoreDefaultArgs: ["--password-store=basic", "--use-mock-keychain"],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--enable-unsafe-extension-debugging",
        "--password-store=gnome-libsecret",
      ],
      viewport: { width: 1440, height: 1000 },
    });
  }
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(process.env.ONSHAPE_DOCUMENT_URL || `${onshapeHome}/documents`);
  await signInWithSavedLogin(context, page);
  await openDocument(page);

  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 10000 }));
  const extensionId = new URL(worker.url()).hostname;
  return { context, page, extensionId, flatpakBrowser, flatpakProcess };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = args();
  const live = await launchOnshapeChromium(options);
  console.log(JSON.stringify({
    browser: process.env.CHROMIUM_FLATPAK_APP ?? browserExecutable(),
    extensionId: live.extensionId,
    url: live.page.url(),
  }));
  if (!options.keepOpen) {
    await live.context.close();
    live.flatpakBrowser?.close();
    if (live.flatpakProcess && live.flatpakProcess.exitCode === null) {
      live.flatpakProcess.kill("SIGTERM");
      await new Promise((resolve) => live.flatpakProcess.once("exit", resolve));
    }
  }
}
