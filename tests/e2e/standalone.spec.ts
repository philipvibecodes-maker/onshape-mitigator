import { expect, test, type Page } from "@playwright/test";
async function openFixture(page: Page, mode = "Sketch") {
  await page.addInitScript(
    ({ mode }) => {
      history.replaceState({}, "", "/documents/doc/w/workspace/e/element");
      (window as any).fixtureMode = mode;
      (window as any).copied = [];
      (window as any).opened = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => (window as any).copied.push(text),
        },
      });
      window.open = ((url: unknown) =>
        (window as any).opened.push(String(url))) as any;
    },
    { mode },
  );
  const html = await (
    await page.request.get("http://127.0.0.1:4173/tests/fixture/")
  ).text();
  await page.route("**/documents/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/tests/fixture/");
  await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
}
async function menu(page: Page) {
  await page.evaluate(() => (window as any).clickExtensionIcon());
  await expect(
    page.getByRole("region", { name: "Onshape Mitigator menu" }),
  ).toBeVisible();
}
async function settings(page: Page) {
  await menu(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("initial sketch state loads without events; collapse preserves finish/cancel and follows geometry", async ({
  page,
}) => {
  await openFixture(page);
  const collapse = page.getByRole("button", {
    name: "Collapse sketch panel",
    exact: true,
  });
  await expect(collapse).toBeVisible();
  expect(await page.evaluate(() => (window as any).selectionReads)).toBe(0);
  await collapse.click();
  await expect(page.locator("#panel-content")).toBeHidden();
  await page.locator("#finish").click();
  await expect(page.locator("body")).toHaveAttribute("data-finished", "true");
  await page.locator("#cancel").click();
  await expect(page.locator("body")).toHaveAttribute("data-cancelled", "true");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#feature-dialog")!.style.left =
      "300px";
  });
  await expect(
    page.getByRole("button", { name: "Expand sketch panel", exact: true }),
  ).toHaveCSS("left", "604px");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#feature-dialog")!.style.left =
      `${innerWidth - 300}px`;
    delete document.body.dataset.cancelled;
  });
  const expand = page.getByRole("button", {
    name: "Expand sketch panel",
    exact: true,
  });
  await expect(expand).toHaveCSS(
    "left",
    `${page.viewportSize()!.width - 330}px`,
  );
  await page.locator("#cancel").click();
  await expect(page.locator("body")).toHaveAttribute("data-cancelled", "true");
  await expect(page.locator("#panel-content")).toBeHidden();
  await page.reload();
  await expect(page.locator("#panel-content")).toBeHidden();
  await page.evaluate(() => (window as any).emitMode("Assembly"));
  await expect(page.locator("#panel-content")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand sketch panel", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => (window as any).emitMode("Sketch"));
  await expect(page.locator("#panel-content")).toBeHidden();
});

test("tooltips are immediate, bounded, and removed with replaced menus", async ({
  page,
}) => {
  await openFixture(page);
  await page.locator('[icon="extrude-button"]').hover();
  const tooltip = page.locator("#mitigator-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("Extrude");
  const box = await tooltip.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  await page.locator('[icon="unknown"]').hover();
  await expect(tooltip).toBeHidden();
  await page.locator('[icon="extrude-button"]').hover();
  await page.evaluate(() =>
    document.querySelector(".os-mini-toolbar-panel")!.remove(),
  );
  await expect(tooltip).toBeHidden();
  await page.evaluate(() => {
    const panel = document.createElement("div");
    panel.className = "os-mini-toolbar-panel";
    panel.innerHTML =
      '<button class="os-tool-item" icon="extrude-button">new</button>';
    document.body.append(panel);
  });
  await page.locator('[icon="extrude-button"]').hover();
  await expect(tooltip).toHaveText("Extrude");
});

test("menu toggles with shortcut and icon; variables shortcut ignores typing and repeat", async ({
  page,
}) => {
  await openFixture(page);
  await page.keyboard.press("Alt+m");
  await expect(
    page.getByRole("region", { name: "Onshape Mitigator menu" }),
  ).toBeVisible();
  await page.keyboard.press("Alt+m");
  await expect(
    page.getByRole("region", { name: "Onshape Mitigator menu" }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Native filter" }).focus();
  await page.keyboard.press("Alt+v");
  await expect(page.locator("body")).not.toHaveAttribute("data-variables");
  await page.locator("h1").click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "v", altKey: true, repeat: true }),
    ),
  );
  await expect(page.locator("body")).not.toHaveAttribute("data-variables");
  await page.keyboard.press("Alt+v");
  await expect(page.locator("body")).toHaveAttribute("data-variables", "true");
});

test("shortcut recording rejects duplicates, Escape cancels recording, Cancel discards edits", async ({
  page,
}) => {
  await openFixture(page);
  await settings(page);
  const binding = page.getByRole("textbox", {
    name: "Toggle variables table",
    exact: true,
  });
  await binding.click();
  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("alert")).toContainText("Already assigned");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(binding).toHaveValue("Alt+V");
  await expect(page.locator("body")).not.toHaveAttribute("data-cancelled");
  await binding.click();
  await page.keyboard.press("Control+Shift+y");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(binding).toHaveValue("Alt+V");
  await binding.click();
  await page.keyboard.press("Backspace");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.reload();
  await settings(page);
  await expect(binding).toHaveValue("Unbound");
});

test("settings text editing stays local and Escape does not cancel native dialogs", async ({
  page,
}) => {
  await openFixture(page);
  await settings(page);
  const url = page.getByRole("textbox", { name: "Chatbot URL" });
  await url.fill("");
  await url.pressSequentially("https://example.com/");
  expect(await page.evaluate(() => (window as any).nativeKeys)).not.toContain(
    "s",
  );
  await url.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-cancelled");
});

test("copy shares full context only on request and honors chatbot preferences", async ({
  page,
}) => {
  await openFixture(page);
  await expect(
    page.getByRole("button", { name: "Collapse sketch panel", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).selectionReads)).toBe(0);
  await menu(page);
  await page
    .getByRole("button", { name: "Copy context for AI", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.length))
    .toBe(1);
  const copied = await page.evaluate(() => (window as any).copied[0]);
  expect(copied).toContain("Top face");
  expect(copied).toContain("width 10 mm");
  expect(copied).toContain("Document ID: doc");
  expect(copied).toContain("Workspace mode: Sketch");
  await expect
    .poll(() => page.evaluate(() => (window as any).opened.length))
    .toBe(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Open chatbot after copying" })
    .uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page
    .getByRole("button", { name: "Copy context for AI", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.length))
    .toBe(2);
  expect(await page.evaluate(() => (window as any).opened.length)).toBe(1);
});

test("clipboard failure reports error and does not open chatbot", async ({
  page,
}) => {
  await openFixture(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
    document.execCommand = () => false;
  });
  await menu(page);
  await page
    .getByRole("button", { name: "Copy context for AI", exact: true })
    .click();
  await expect(
    page.getByText("Could not copy context", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).opened.length)).toBe(0);
});

test("DOM features and partial context survive missing services and document navigation", async ({
  page,
}) => {
  await openFixture(page, "Part Studio");
  await page.evaluate(() => {
    (window as any).services = undefined;
  });
  await page.locator('[icon="extrude-button"]').hover();
  await expect(page.locator("#mitigator-tooltip")).toHaveText("Extrude");
  await menu(page);
  await page
    .getByRole("button", { name: "Copy context for AI", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.length))
    .toBe(1);
  expect(await page.evaluate(() => (window as any).copied[0])).toContain(
    "selection data may be unavailable",
  );
  await page.evaluate(() =>
    history.pushState({}, "", "/documents/other/v/version/e/assembly"),
  );
  await page
    .getByRole("button", { name: "Copy context for AI", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copied.length))
    .toBe(2);
  expect(await page.evaluate(() => (window as any).copied[1])).toContain(
    "Document ID: other",
  );
  await page.evaluate(() => history.pushState({}, "", "/home"));
  await expect(
    page.getByRole("button", { name: "Copy context for AI", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#mitigator-tooltip")).toHaveCount(0);
});
