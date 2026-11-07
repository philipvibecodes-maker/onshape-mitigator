import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const directory = path.resolve("tests/states");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : entry.name.endsWith(".json") ? [filename] : [];
  });
}

for (const filename of files(directory)) {
  test(`offline state: ${path.relative(directory, filename)}`, async ({ page }) => {
    const snapshot = JSON.parse(readFileSync(filename, "utf8"));
    const external: string[] = [];
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== "http://127.0.0.1:4173") {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.setViewportSize(snapshot.viewport);
    await page.goto("/tests/replay/");
    await page.locator("#state-file").setInputFiles(filename);
    await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe(snapshot.path);
    const recorded = await page.evaluate(async () => {
      // @ts-expect-error Vite serves the production adapter directly.
      const { readPage } = await import("/src/adapter/client.ts");
      return {
        state: await readPage("state"), selections: await readPage("selections"), model: await readPage("model"),
      };
    });
    expect(recorded).toEqual({ state: snapshot.state, selections: snapshot.selections, model: snapshot.model });
    const collapse = page.getByRole("button", { name: "Collapse sketch panel", exact: true });
    if (snapshot.state.toolbarType === "Sketch" && snapshot.html.includes('id="feature-dialog"')) {
      await expect(collapse).toBeVisible();
      await collapse.click();
      await expect(page.getByRole("button", { name: "Expand sketch panel", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Expand sketch panel", exact: true }).click();
      await expect(collapse).toBeVisible();
    } else {
      await expect(collapse).toHaveCount(0);
    }
    await page.evaluate(() => (window as any).clickExtensionIcon());
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Onshape Mitigator settings" })).toBeVisible();
    expect(external).toEqual([]);
  });
}

test("users can save a named state and replay the downloaded file", async ({ page }, testInfo) => {
  await page.goto("/tests/replay/");
  await page.screenshot({ path: testInfo.outputPath("state-viewer.png") });
  await page.getByRole("button", { name: "onshape-sketch-edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Collapse sketch panel", exact: true })).toBeVisible();
  // Capture a collapsed panel: the export must retain the expanded native layout.
  await page.getByRole("button", { name: "Collapse sketch panel", exact: true }).click();
  await page.evaluate(() => (window as any).clickExtensionIcon());
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Test state name", exact: true }).fill("My sketch regression");
  await page.getByRole("textbox", { name: "Expected behavior / steps", exact: true }).fill("Panel can expand again.");
  await page.getByRole("button", { name: "Save test state", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("state-capture.png") });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save test state", exact: true }).click();
  const download = await downloadPromise;
  const filename = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(filename);
  const saved = JSON.parse(readFileSync(filename, "utf8"));
  expect(saved.name).toBe("My sketch regression");
  expect(saved.html).not.toContain("onshape-extension-host");
  expect(saved.state.toolbarType).toBe("Sketch");
  await page.goto("/tests/replay/");
  await page.locator("#state-file").setInputFiles(filename);
  const panelContent = page.locator("#feature-dialog .ns-dialog-fixed-content");
  await expect(panelContent).toBeVisible();
  await page.getByRole("button", { name: "Collapse sketch panel", exact: true }).click();
  await expect(panelContent).toBeHidden();
  await page.getByRole("button", { name: "Expand sketch panel", exact: true }).click();
  await expect(panelContent).toBeVisible();
});

test("invalid imports show an error and leave the viewer usable", async ({ page }) => {
  await page.goto("/tests/replay/");
  await page.locator("#state-file").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(page.getByRole("alert")).toContainText("Invalid or unsupported");
  await page.getByRole("button", { name: "onshape-sketch-edit", exact: true }).click();
  await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
});

test("replay fits a narrow viewer and browser navigation returns to the state list", async ({ page }) => {
  const snapshot = JSON.parse(readFileSync(path.join(directory, "onshape-part-studio.json"), "utf8"));
  await page.setViewportSize({ width: 625, height: 1025 });
  await page.goto("/tests/replay/");
  await page.getByRole("button", { name: "onshape-part-studio", exact: true }).click();
  await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe(snapshot.path);
  const scale = Math.min(1, 625 / snapshot.viewport.width, 1025 / snapshot.viewport.height);
  const renderedScale = await page.locator("body").evaluate((body) => Number(getComputedStyle(body).zoom));
  expect(renderedScale).toBeCloseTo(scale, 5);
  const share = await page.getByText("Share", { exact: true }).boundingBox();
  expect(share).not.toBeNull();
  expect(share!.x).toBeGreaterThanOrEqual(0);
  expect(share!.x + share!.width).toBeLessThanOrEqual(625);

  const copy = await page.locator(".document-copy-link-btn:visible").boundingBox();
  const like = await page.locator('os-public-stats:visible [icon="document-likes"]').boundingBox();
  expect(copy).not.toBeNull();
  expect(like).not.toBeNull();
  expect(Math.abs(copy!.y + copy!.height / 2 - (like!.y + like!.height / 2))).toBeLessThan(5);
  const shortcutFits = await page.locator(".command-search-trigger:visible").evaluate((element) =>
    element.scrollHeight <= element.clientHeight,
  );
  expect(shortcutFits).toBe(true);

  const extrude = page.locator(".tool").filter({
    has: page.locator(".tool-label", { hasText: "Extrude" }),
  }).first();
  await extrude.hover();
  await expect(page.locator("#offline-replay-tooltip")).toHaveText("Extrude");
  await expect(page.locator("#offline-replay-tooltip")).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Offline test states" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/tests/replay/");

  await page.getByRole("button", { name: "onshape-part-studio", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe(snapshot.path);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Offline test states" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/tests/replay/");
});
