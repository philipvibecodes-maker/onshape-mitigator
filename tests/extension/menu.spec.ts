import { mkdtemp, readFile, rm } from "node:fs/promises";
import { browserPath } from "../browser-path";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";

test("production extension action, migration, tab isolation and persistent cross-tab disable", async () => {
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
      await cdp.send("Extensions.triggerAction", {
        id,
        targetId: target!.targetId,
      });
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
    await icon(first);
    await expect(menu).toBeVisible();
    await expect(
      second.getByRole("region", { name: "Onshape Mitigator menu" }),
    ).toHaveCount(0);
    await icon(first);
    await expect(menu).toHaveCount(0);
    await icon(first);
    await expect(menu).toBeVisible();
    await first.screenshot({
      path: "test-results/extension/standalone-menu.png",
    });
    await first.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      first.getByRole("textbox", { name: "Open settings", exact: true }),
    ).toHaveValue("Ctrl+Shift+Y");
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
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
    await Promise.all([
      first.waitForEvent("load"),
      second.waitForEvent("load"),
      first
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
    await icon(third);
    await expect(
      third.getByRole("button", { name: "Enable extension", exact: true }),
    ).toBeVisible();
    await expect(
      third.getByRole("button", { name: "Copy context for AI", exact: true }),
    ).toHaveCount(0);
    await third.reload();
    await icon(third);
    await expect(
      third.getByRole("button", { name: "Enable extension", exact: true }),
    ).toBeVisible();
    await third.screenshot({
      path: "test-results/extension/disabled-menu.png",
    });
    await Promise.all([
      ...[first, second, third].map((page) => page.waitForEvent("load")),
      third
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
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
