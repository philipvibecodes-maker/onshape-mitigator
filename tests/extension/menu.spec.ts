import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";

// The built extension runs unmodified. Only the remote CAD document is a fixture;
// Chrome supplies extension storage, content-script isolation and action events.
const documentHtml = `<!doctype html><body>
<div id="content-div"><div id="left-content-pane"></div></div>
<input aria-label="Native input">
<script>
setInterval(() => {
  window.postMessage({type:"OS_ANGULAR_EVENT",name:"ENABLE_TOOLBAR"}, location.origin);
  window.postMessage({type:"OS_ANGULAR_EVENT",name:"CHANGE_ELEMENT_TOOLBAR",args:[{toolbarName:"Sketch"}]}, location.origin);
}, 50);
</script></body>`;

test("packaged extension action toggles menu and disabling persists across tabs", async () => {
	const profile = await mkdtemp(path.join(tmpdir(), "onshape-menu-test-"));
	const context = await chromium.launchPersistentContext(profile, {
		executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
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
				hasSeenWelcomeDialog: true,
				floatingNumpadMode: "always",
				theme: "light",
			}),
		);
		await context.route("https://cad.onshape.com/**", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: documentHtml,
			}),
		);
		await context.route("https://fonts.googleapis.com/**", (route) =>
			route.abort(),
		);
		const errors: string[] = [];
		context.on("page", (page) =>
			page.on("pageerror", (error) => errors.push(error.message)),
		);
		async function newDocument(name: string) {
			const page = await context.newPage();
			await page.goto(`https://cad.onshape.com/documents/${name}`);
			await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
			return page;
		}
		async function clickIcon(page: Page) {
			await page.bringToFront();
			const { targetInfos } = await cdp.send("Target.getTargets", {
				filter: [{ type: "tab" }],
			});
			const target = targetInfos.find((target) => target.url === page.url());
			expect(
				target,
				"Chrome tab target for the Onshape document",
			).toBeDefined();
			await cdp.send("Extensions.triggerAction", {
				id,
				targetId: target!.targetId,
			});
		}
		const first = await newDocument("first");
		const second = await newDocument("second");
		const menu = first.locator("#os-pen-shortcut-sidebar");
		await expect(menu).toHaveCount(0);
		// Verify features have initialized before invoking the real browser action.
		await first.getByRole("textbox", { name: "Native input" }).focus();
		await expect(first.locator("#os-floating-cad-keyboard")).toBeVisible();
		await clickIcon(first);
		await expect(menu).toBeVisible();
		await expect(first.locator("#os-floating-cad-keyboard")).toHaveCount(0);
		await expect(second.locator("#os-pen-shortcut-sidebar")).toHaveCount(0);
		await clickIcon(first);
		await expect(menu).toHaveCount(0);
		await clickIcon(first);
		await expect(menu).toBeVisible();
		await expect(menu).toBeInViewport();
		await expect(menu).toHaveCSS("opacity", "1");
		await first.screenshot({ path: "test-results/extension/menu-open.png" });
		await Promise.all([
			first.waitForEvent("load", { timeout: 10_000 }),
			second.waitForEvent("load", { timeout: 10_000 }),
			first
				.getByRole("button", { name: "Disable extension" })
				.click({ timeout: 5_000 }),
		]);
		for (const page of [first, second]) {
			await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
			await expect(page.locator("#os-onshape-theme")).toHaveCount(0);
			await expect(page.locator("#os-onshape-page-bridge")).toHaveCount(0);
			await page.getByRole("textbox", { name: "Native input" }).focus();
			await expect(page.locator("#os-floating-cad-keyboard")).toHaveCount(0);
		}
		const third = await newDocument("opened-while-disabled");
		await expect(third.locator("#os-onshape-theme")).toHaveCount(0);
		await expect(
			third.getByRole("button", { name: "Enable extension" }),
		).toHaveCount(0);
		await clickIcon(third);
		await expect(
			third.getByRole("button", { name: "Enable extension" }),
		).toBeVisible();
		await third.screenshot({
			path: "test-results/extension/disabled-menu.png",
		});
		await third.reload();
		await expect(third.locator("#onshape-extension-host")).toHaveCount(1);
		await expect(third.locator("#os-onshape-theme")).toHaveCount(0);
		await clickIcon(third);
		await Promise.all([
			...[first, second, third].map((page) => page.waitForEvent("load")),
			third.getByRole("button", { name: "Enable extension" }).click(),
		]);
		for (const page of [first, second, third]) {
			await expect(page.locator("#os-onshape-theme")).toHaveCount(1);
			await expect(page.locator("#os-pen-shortcut-sidebar")).toHaveCount(0);
		}
		await clickIcon(first);
		await expect(menu).toBeVisible();
		const saved = await worker.evaluate(() =>
			chrome.storage.local.get([
				"extensionEnabled",
				"theme",
				"floatingNumpadMode",
			]),
		);
		expect(saved).toMatchObject({
			extensionEnabled: true,
			theme: "light",
			floatingNumpadMode: "always",
		});
		expect(errors).toEqual([]);
	} finally {
		await context.close();
		await rm(profile, { recursive: true, force: true });
	}
});
