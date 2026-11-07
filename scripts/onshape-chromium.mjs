#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const extensionPath = path.join(repoRoot, "dist");
const onshapeHome = "https://cad.onshape.com";
const documentPattern = /\/documents\/[^/]+\/(?:w|v|m)\/[^/]+\/e\/[^/?#]+/;
const defaultFlatpakApp = "org.chromium.Chromium";
const defaultProfileDir = path.join(
  homedir(),
  ".var/app/org.chromium.Chromium/config/chromium",
);

function setDesktopEnvironmentDefaults() {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const runtimeDir = `/run/user/${uid}`;
  if (existsSync(runtimeDir)) {
    // Command runners can inherit another desktop user's paths. The browser and
    // keyring must use the session belonging to the account running this script.
    process.env.XDG_RUNTIME_DIR = runtimeDir;
    process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${runtimeDir}/bus`;
  }
  const session = spawnSync("systemctl", ["--user", "show-environment"], {
    encoding: "utf8",
    env: process.env,
  });
  const values = Object.fromEntries(
    session.status === 0
      ? session.stdout.split("\n").flatMap((line) => {
          const index = line.indexOf("=");
          return index > 0 ? [[line.slice(0, index), line.slice(index + 1)]] : [];
        })
      : [],
  );
  process.env.DISPLAY = values.DISPLAY || process.env.DISPLAY || ":1";
  const xauthority = values.XAUTHORITY || `${runtimeDir}/gdm/Xauthority`;
  if (existsSync(xauthority)) process.env.XAUTHORITY = xauthority;
  const keyring = values.GNOME_KEYRING_CONTROL || `${runtimeDir}/keyring`;
  if (existsSync(keyring)) process.env.GNOME_KEYRING_CONTROL = keyring;
}

function flatpakApp() {
  if (process.env.CHROME_PATH || process.env.CHROMIUM_FLATPAK_APP === "none")
    return null;
  if (process.env.CHROMIUM_FLATPAK_APP)
    return process.env.CHROMIUM_FLATPAK_APP;
  const installed = spawnSync("flatpak", ["info", defaultFlatpakApp], {
    stdio: "ignore",
  }).status === 0;
  return installed ? defaultFlatpakApp : null;
}

function browserExecutable(app) {
  if (app) return null;
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

function profileProcessIds(profileDir) {
  const result = spawnSync(
    "pgrep",
    ["-af", "--", `--user-data-dir=${profileDir}`],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return [];
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => Number(line.trim().split(/\s+/, 1)[0]))
    .filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid);
}

async function stopProfileProcesses(profileDir) {
  for (const pid of profileProcessIds(profileDir)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    if (profileProcessIds(profileDir).length === 0) return;
    await delay(250);
  }
  throw new Error(
    `Task-launched Chromium processes still hold profile ${profileDir}`,
  );
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(300);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function usage() {
  console.log(`Usage: npm run test:live -- [options]

Launches Chromium with the built extension, signs in through the saved
onshape.com credential, and opens a live Onshape document.

Options:
  --headed       Show the browser window (default: headless)
  --keep-open    Leave the browser running after setup

Environment:
  CHROME_PATH                  Use this executable instead of Flatpak Chromium
  CHROMIUM_FLATPAK_APP         Flatpak app override; "none" disables Flatpak
  CHROMIUM_DEBUG_PORT          CDP port override (default: 9224)
  ONSHAPE_PROFILE_DIR          Profile override (default: the current user's
                               org.chromium.Chromium Flatpak profile)
  ONSHAPE_DOCUMENT_URL         Open this document URL instead of the first one
  ONSHAPE_DOCUMENT_NAME        Open a document with this exact visible name

The helper discovers the current user's desktop bus, display, keyring, and
Xauthority settings so stale values inherited from another user are not reused.
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
    await current.waitForTimeout(1000);
    const signInForm = await current
      .locator('input[name="username"], input[placeholder="Email"], input[type="password"]')
      .count();
    if (signInForm === 0) return current;
  }

  if (!current.url().includes("/signin")) await current.goto(`${onshapeHome}/signin`);
  await current.waitForLoadState("domcontentloaded");
  await current.waitForTimeout(1000);
  if (documentPattern.test(current.url())) return current;
  if (current.url().includes("/documents")) {
    const signInForm = await current
      .locator('input[name="username"], input[placeholder="Email"], input[type="password"]')
      .count();
    if (signInForm === 0) return current;
  }

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
  await page.locator("canvas").first().waitFor({ state: "visible" });
  await page.waitForTimeout(1500);
  return page;
}

export async function launchOnshapeChromium({ headed = false } = {}) {
  setDesktopEnvironmentDefaults();
  const app = flatpakApp();
  const executablePath = browserExecutable(app);
  const profileDir = process.env.ONSHAPE_PROFILE_DIR || defaultProfileDir;
  if (!existsSync(profileDir))
    throw new Error(`Chromium profile does not exist: ${profileDir}`);
  if (profileProcessIds(profileDir).length)
    throw new Error(
      `Chromium profile is already in use: ${profileDir}. Close that browser instead of launching the profile concurrently.`,
    );

  let context;
  let flatpakProcess;
  let flatpakBrowser;
  const port = Number(process.env.CHROMIUM_DEBUG_PORT ?? 9224);
  if (app) {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error(`Invalid CHROMIUM_DEBUG_PORT: ${process.env.CHROMIUM_DEBUG_PORT}`);
    if (await portIsOpen(port))
      throw new Error(
        `CDP port ${port} is already in use. Close the earlier task browser or choose CHROMIUM_DEBUG_PORT.`,
      );
    flatpakProcess = spawn(
      "flatpak",
      [
        "run",
        "--command=chromium",
        app,
        `--user-data-dir=${profileDir}`,
        `--remote-debugging-port=${port}`,
        "--remote-debugging-address=127.0.0.1",
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--enable-unsafe-extension-debugging",
        "--password-store=gnome-libsecret",
        ...(headed ? [] : ["--headless=new"]),
        `${onshapeHome}/documents`,
      ],
      { stdio: "ignore", env: process.env },
    );
    const endpoint = `http://127.0.0.1:${port}`;
    let lastError;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (flatpakProcess.exitCode !== null) {
        await stopProfileProcesses(profileDir).catch(() => {});
        throw new Error(`Flatpak Chromium exited with code ${flatpakProcess.exitCode}`);
      }
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
      await stopProfileProcesses(profileDir).catch(() => {});
      throw new Error(`Could not connect to Flatpak Chromium at ${endpoint}: ${lastError}`);
    }
    context = flatpakBrowser.contexts()[0];
    if (!context) {
      await flatpakBrowser.close().catch(() => {});
      flatpakProcess.kill("SIGTERM");
      await stopProfileProcesses(profileDir).catch(() => {});
      throw new Error("Flatpak Chromium has no default browser context");
    }
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
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${onshapeHome}/documents`);
    await signInWithSavedLogin(context, page);
    await openDocument(page);

    const deadline = Date.now() + 10000;
    let worker;
    while (!worker && Date.now() < deadline) {
      for (const candidate of context.serviceWorkers()) {
        const name = await candidate
          .evaluate(() => globalThis.chrome?.runtime?.getManifest?.().name)
          .catch(() => null);
        if (name === "Onshape Mitigator") {
          worker = candidate;
          break;
        }
      }
      if (!worker) await delay(250);
    }
    if (!worker) throw new Error("Onshape Mitigator service worker did not start");
    const extensionId = new URL(worker.url()).hostname;
    return {
      context,
      page,
      extensionId,
      flatpakBrowser,
      flatpakProcess,
      port: app ? port : null,
      profileDir,
    };
  } catch (error) {
    await flatpakBrowser?.close().catch(() => {});
    await context?.close().catch(() => {});
    if (flatpakProcess && flatpakProcess.exitCode === null)
      flatpakProcess.kill("SIGTERM");
    if (app) await stopProfileProcesses(profileDir).catch(() => {});
    throw error;
  }
}

async function closeLiveBrowser(live) {
  await live.context.close().catch(() => {});
  await live.flatpakBrowser?.close().catch(() => {});
  if (live.flatpakProcess && live.flatpakProcess.exitCode === null) {
    live.flatpakProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => live.flatpakProcess.once("exit", resolve)),
      delay(3000),
    ]);
  }
  if (live.port) await stopProfileProcesses(live.profileDir);
  if (live.port && await portIsOpen(live.port))
    throw new Error(
      `Chromium did not release CDP port ${live.port}; stop only the task-launched Chromium process.`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = args();
  const live = await launchOnshapeChromium(options);
  console.log(JSON.stringify({
    browser: flatpakApp() ?? browserExecutable(null),
    extensionId: live.extensionId,
    url: live.page.url(),
  }));
  if (options.keepOpen)
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  await closeLiveBrowser(live);
}
