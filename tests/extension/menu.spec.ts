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
		deviceScaleFactor: 2,
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
				keyboardShortcuts: { openSettings: "", togglePenSidebar: "Alt+B" },
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
		await first.locator("body").click();
		await first.keyboard.press("Alt+m");
		await expect(menu).toBeVisible();
		await first.keyboard.press("Alt+m");
		await expect(menu).toBeVisible();
		await first.getByRole("button", { name: "Hide menu", exact: true }).click();
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
		await cdp.send("Browser.setPermission", {
			permission: { name: "keyboard-lock" },
			setting: "granted",
			origin: "https://cad.onshape.com",
		});
		await first.evaluate(() => {
			const dialog = document.createElement("div");
			dialog.id = "feature-dialog";
			dialog.textContent = "Feature editor";
			document.body.append(dialog);
			document.addEventListener(
				"keydown",
				(event) => {
					if (event.key === "Escape") dialog.remove();
				},
				{ once: true },
			);
		});
		await first
			.locator("button")
			.filter({ has: first.locator("svg.lucide-fullscreen") })
			.click();
		await expect
			.poll(() => first.evaluate(() => !!document.fullscreenElement))
			.toBe(true);
		await first.keyboard.press("Escape");
		await expect(first.locator("#feature-dialog")).toHaveCount(0);
		expect(await first.evaluate(() => !!document.fullscreenElement)).toBe(true);
		await first.getByRole("button", { name: "Hide menu", exact: true }).click();
		await first.keyboard.press("Escape");
		await expect
			.poll(() => first.evaluate(() => !!document.fullscreenElement))
			.toBe(false);
		await expect(first.locator("body")).not.toHaveClass(
			/onshape-plus-fullscreen-mode/,
		);
		await first.keyboard.press("Alt+m");
		await expect(menu).toBeVisible();
		async function expectBottomToggle(name: string) {
			const toggle = first.getByRole("button", { name, exact: true });
			await expect(toggle).toBeInViewport();
			const bounds = await toggle.boundingBox();
			const menuBounds = await menu.boundingBox();
			expect(bounds!.width).toBeGreaterThan(bounds!.height * 3);
			expect(bounds!.height).toBeLessThanOrEqual(28);
			const bottomGap =
				menuBounds!.y + menuBounds!.height - bounds!.y - bounds!.height;
			expect(bottomGap).toBeGreaterThanOrEqual(8);
			expect(bottomGap).toBeLessThanOrEqual(12);
			await expect(toggle).toHaveAttribute(
				"aria-expanded",
				String(name === "Collapse menu"),
			);
		}
		await expectBottomToggle("Collapse menu");
		const disable = first.getByRole("button", {
			name: "Disable extension",
			exact: true,
		});
		const copyContext = first.getByRole("button", {
			name: "Copy context for AI",
			exact: true,
		});
		await expect(disable).toHaveText("");
		await expect(copyContext).toBeVisible();
		await first
			.getByRole("button", { name: "Collapse menu", exact: true })
			.click();
		await expect(disable).toHaveCount(0);
		await expect(copyContext).toHaveCount(0);
		await expectBottomToggle("Expand menu");
		await first.mouse.move(1000, 650);
		await expect(menu).toHaveCSS("opacity", "1");
		await menu.screenshot({
			path: "test-results/extension/menu-collapsed.png",
		});
		await first.getByRole("button", { name: "Hide menu", exact: true }).click();
		await expect(menu).toHaveCount(0);
		await clickIcon(first);
		await expect(
			first.getByRole("button", { name: "Expand menu", exact: true }),
		).toBeVisible();
		await first
			.getByRole("button", { name: "Expand menu", exact: true })
			.click();
		await expect(disable).toBeVisible();
		await expect(copyContext).toBeVisible();
		await expect(menu).toBeInViewport();
		await expect(menu).toHaveCSS("opacity", "1");
		await first.mouse.move(1000, 650);
		await menu.screenshot({ path: "test-results/extension/menu-open.png" });
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
