import { mkdtemp, readFile, rm } from "node:fs/promises";
import { browserPath } from "../browser-path";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";

// Chromium exposes headless action popups as "other" targets. Include them in
// Playwright's page inventory so we test the real popup, not a surrogate tab.
process.env.PW_CHROMIUM_ATTACH_TO_OTHER = "1";

test("anchored popup, fullscreen fallback, migration and persistent cross-tab disable", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "mitigator-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: browserPath,
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--no-sandbox", "--enable-unsafe-extension-debugging"],
  });
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: path.resolve("dist"),
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await worker.evaluate(() =>
      chrome.storage.local.set({
        settingsVersion: 2,
        theme: "dark",
        floatingNumpadMode: "always",
        sketchToolbarCollapsed: true,
        aiChatbotUrl: "https://example.com/",
        aiOpenAfterCopy: false,
        keyboardShortcuts: {
          openSettings: "Ctrl+Shift+Y",
          togglePenSidebar: "Alt+B",
        },
      }),
    );
    const html = (await readFile("tests/fixture/index.html", "utf8"))
      .replace('<script src="/keyboard-guard.js"></script>', "")
      .replace(
        '<script type="module" src="/tests/fixture/boot.ts"></script>',
        "",
      );
    await context.route("https://cad.onshape.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    const errors: string[] = [];
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    async function document(name: string) {
      const page = await context.newPage();
      await page.goto(`https://cad.onshape.com/documents/${name}/w/w/e/e`);
      await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
      return page;
    }
    async function icon(page: Page) {
      await page.bringToFront();
      const { targetInfos } = await cdp.send("Target.getTargets", {
        filter: [{ type: "tab" }],
      });
      const target = targetInfos.find((target) => target.url === page.url());
      expect(target).toBeDefined();
      const opened = context.waitForEvent("page", {
        predicate: (page) => page.url() === `chrome-extension://${id}/popup.html`,
      });
      await cdp.send("Extensions.triggerAction", {
        id,
        targetId: target!.targetId,
      });
      const popup = await opened;
      await expect(popup.getByRole("region", { name: "Onshape Mitigator menu" })).toBeVisible();
      return popup;
    }
    const first = await document("first"),
      second = await document("second");
    const menu = first.getByRole("region", { name: "Onshape Mitigator menu" });
    await expect(menu).toHaveCount(0);
    await expect(first.locator("#panel-content")).toBeHidden();
    await expect(first.locator("#os-onshape-theme")).toHaveCount(0);
    await expect(first.locator("#os-floating-cad-keyboard")).toHaveCount(0);
    await expect(first.locator("body")).not.toHaveAttribute("data-os-theme");
    expect(await first.evaluate(() => (window as any).selectionReads)).toBe(0);
    let popup = await icon(first);
    await expect(menu).toHaveCount(0);
    await expect(
      second.getByRole("region", { name: "Onshape Mitigator menu" }),
    ).toHaveCount(0);
    await expect(popup.getByRole("button", { name: "Copy context for AI", exact: true })).toBeEnabled();
    await popup.getByRole("button", { name: "Copy context for AI", exact: true }).click();
    await expect(popup.getByRole("status")).toHaveText("Context copied for AI");
    await popup.getByRole("button", { name: "Hide menu", exact: true }).click();
    await expect.poll(() => popup.isClosed()).toBe(true);
    const filter = first.getByRole("textbox", { name: "Native filter", exact: true });
    await filter.focus();
    await filter.press("Control+v");
    await expect(filter).toHaveValue(/# Onshape Context/);
    await filter.fill("");
    popup = await icon(first);
    await expect(popup.getByRole("region", { name: "Onshape Mitigator menu" })).toHaveCSS("font-size", "14px");
    await popup.getByRole("region", { name: "Onshape Mitigator menu" }).screenshot({
      path: "test-results/extension/standalone-menu.png",
    });
    await popup.getByRole("button", { name: "Settings", exact: true }).click();
    await expect.poll(() => popup.isClosed()).toBe(true);
    await expect(
      first.getByRole("textbox", { name: "Open settings", exact: true }),
    ).toHaveValue("Ctrl+Shift+Y");
    await first.getByRole("button", { name: "Cancel", exact: true }).click();

    // Alt+M uses the same native popup when the toolbar is available.
    await first.locator("h1").click();
    const shortcutPopup = context.waitForEvent("page", {
      predicate: (page) => page.url() === `chrome-extension://${id}/popup.html`,
    });
    await first.keyboard.press("Alt+m");
    popup = await shortcutPopup;
    await expect(popup.getByRole("region", { name: "Onshape Mitigator menu" })).toBeVisible();
    await expect(menu).toHaveCount(0);
    await popup.getByRole("button", { name: "Hide menu", exact: true }).click();

    // With the browser toolbar hidden, use the matching in-page menu at its
    // upper-right edge, without the old fixed 64px gap.
    const pageCdp = await context.newCDPSession(first);
    const { windowId } = await pageCdp.send("Browser.getWindowForTarget");
    await pageCdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "fullscreen" } });
    await first.locator("h1").click();
    await first.keyboard.press("Alt+m");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS("top", "8px");
    await expect(menu).toHaveCSS("right", "8px");
    await expect(menu).toHaveCSS("width", "250px");
    await expect(second.getByRole("region", { name: "Onshape Mitigator menu" })).toHaveCount(0);
    await first.screenshot({ path: "test-results/extension/fullscreen-menu.png" });
    await first.keyboard.press("Alt+m");
    await expect(menu).toHaveCount(0);

    // Page zoom must not change the fallback's apparent size or edge spacing
    // relative to the native browser popup.
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.setZoom(tab.id!, 0.8);
    });
    await first.keyboard.press("Alt+m");
    await expect(menu).toBeVisible();
    const zoomedBox = await menu.boundingBox();
    const dpr = await first.evaluate(() => devicePixelRatio);
    expect(zoomedBox!.width * dpr).toBeCloseTo(250, 0);
    expect(zoomedBox!.y * dpr).toBeCloseTo(8, 0);
    await first.keyboard.press("Alt+m");
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.setZoom(tab.id!, 1);
    });
    await pageCdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });

    // HTML fullscreen also hides the toolbar independently of window state.
    await first.evaluate(() => document.documentElement.requestFullscreen());
    await first.keyboard.press("Alt+m");
    await expect(menu).toBeVisible();
    await first.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await first.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
    const migrated = await worker.evaluate(() =>
      chrome.storage.local.get([
        "settingsVersion",
        "keyboardShortcuts",
        "theme",
      ]),
    );
    expect(migrated.settingsVersion).toBe(3);
    expect(migrated.keyboardShortcuts).not.toHaveProperty("togglePenSidebar");
    expect(migrated.theme).toBe("dark");
    popup = await icon(first);
    await Promise.all([
      first.waitForEvent("load"),
      second.waitForEvent("load"),
      popup
        .getByRole("button", { name: "Disable extension", exact: true })
        .click(),
    ]);
    for (const page of [first, second]) {
      await expect(page.locator("#mitigator-page-adapter")).toHaveCount(0);
      await expect(page.locator("#mitigator-page-style")).toHaveCount(0);
      await expect(page.locator("#panel-content")).toBeVisible();
    }
    const third = await document("disabled");
    await expect(third.locator("#mitigator-page-adapter")).toHaveCount(0);
    popup = await icon(third);
    await expect(
      popup.getByRole("button", { name: "Enable extension", exact: true }),
    ).toBeVisible();
    await expect(
      popup.getByRole("button", { name: "Copy context for AI", exact: true }),
    ).toHaveCount(0);
    await third.reload();
    popup = await icon(third);
    await expect(
      popup.getByRole("button", { name: "Enable extension", exact: true }),
    ).toBeVisible();
    await popup.getByRole("region", { name: "Onshape Mitigator menu" }).screenshot({
      path: "test-results/extension/disabled-menu.png",
    });
    await Promise.all([
      ...[first, second, third].map((page) => page.waitForEvent("load")),
      popup
        .getByRole("button", { name: "Enable extension", exact: true })
        .click(),
    ]);
    for (const page of [first, second, third]) {
      await expect(page.locator("#mitigator-page-adapter")).toHaveCount(1);
      await expect(page.locator("#panel-content")).toBeHidden();
      await expect(
        page.getByRole("region", { name: "Onshape Mitigator menu" }),
      ).toHaveCount(0);
    }
    const saved = await worker.evaluate(() =>
      chrome.storage.local.get([
        "extensionEnabled",
        "sketchToolbarCollapsed",
        "aiChatbotUrl",
        "aiOpenAfterCopy",
      ]),
    );
    expect(saved).toEqual({
      extensionEnabled: true,
      sketchToolbarCollapsed: true,
      aiChatbotUrl: "https://example.com/",
      aiOpenAfterCopy: false,
    });

    const outside = await context.newPage();
    await outside.goto("about:blank");
    popup = await icon(outside);
    await expect(popup.getByRole("button", { name: "Copy context for AI", exact: true })).toBeDisabled();
    await expect(popup.getByRole("button", { name: "Settings", exact: true })).toBeDisabled();
    await expect(popup.getByRole("status")).toContainText("Onshape tab");
    await popup.getByRole("button", { name: "Hide menu", exact: true }).click();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
