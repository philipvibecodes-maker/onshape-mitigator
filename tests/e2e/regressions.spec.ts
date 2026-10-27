import { expect, test, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
	await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
	await page.goto("/tests/fixture/");
	await expect(
		page.getByRole("button", { name: "Collapse sketch panel" }),
	).toBeVisible();
});
async function key(page: Page, name: string) {
	await page
		.locator("#os-floating-cad-keyboard")
		.getByRole("button", { name, exact: true })
		.click();
}
test("native finish and cancel remain clickable before and after collapse", async ({
	page,
}) => {
	await page.locator("#cancel").click({ timeout: 1500 });
	await expect(page.locator("body")).toHaveAttribute("data-cancelled", "true");
	await page.locator("#finish").click();
	await expect(page.locator("body")).toHaveAttribute("data-finished", "true");
	await page.getByRole("button", { name: "Collapse sketch panel" }).click();
	await expect(page.locator("#panel-content")).toBeHidden();
	await page.locator("#cancel").click();
	await page.locator("#finish").click();
	await page.getByRole("button", { name: "Expand sketch panel" }).click();
	await expect(page.locator("#panel-content")).toBeVisible();
});
test("settings text is isolated from earlier native capture listeners", async ({
	page,
}) => {
	await page.keyboard.press("Alt+Shift+T"); // native extension shortcut still works
	await expect(
		page.getByRole("button", { name: "Expand sketch panel" }),
	).toBeVisible();
	// Open settings through the production keypad's settings control.
	await page.locator("#native-input").focus();
	await page
		.locator("#os-floating-cad-keyboard")
		.locator("button")
		.filter({ has: page.locator("svg.lucide-settings") })
		.click();
	await page.getByRole("button", { name: /AI Assistant/ }).click();
	const url = page.getByPlaceholder("https://chatgpt.com/?q={context}");
	await url.fill("");
	await url.pressSequentially("lsd");
	await expect(url).toHaveValue("lsd");
	expect(await page.evaluate(() => (window as any).nativeKeys)).toEqual([]);
	await url.press("Control+z");
	expect(await url.inputValue()).not.toBe("lsd");
	await url.press("Control+Shift+z");
	await expect(url).toHaveValue("lsd");
	await url.press("Escape");
	await expect(page.getByRole("dialog")).toBeHidden();
});
for (const [arrow, expected] of [
	["→", "123495"],
	["←", "192345"],
]) {
	test(`keypad ${arrow} collapses selected text before inserting`, async ({
		page,
	}) => {
		const input = page.locator("#native-input");
		await input.fill("12345");
		await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 4));
		await key(page, arrow);
		await key(page, "9");
		await expect(input).toHaveValue(expected);
	});
}
test("same-frame focus/blur leaves no ghost keypad", async ({ page }) => {
	await page.locator("#native-input").evaluate((el: HTMLInputElement) => {
		el.focus();
		el.blur();
	});
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			),
	);
	await expect(page.locator("#os-floating-cad-keyboard")).toHaveCount(0);
});
for (const selector of ["#native-input", "#native-area"]) {
	for (const edit of ["insert", "backspace", "clear"]) {
		test(`${selector} keypad ${edit} participates in native Undo/Redo`, async ({
			page,
		}) => {
			const input = page.locator(selector);
			await input.focus();
			if (edit !== "insert") await input.pressSequentially("123");
			const before = await input.inputValue();
			if (edit === "insert") {
				await key(page, "1");
				await key(page, "2");
				await key(page, "3");
			}
			if (edit === "backspace") await key(page, "⌫");
			if (edit === "clear") await key(page, "Clear");
			const after = await input.inputValue();
			expect(after).not.toBe(before);
			await page.keyboard.press("Control+z");
			if (edit === "insert") expect(await input.inputValue()).not.toBe(after);
			else await expect(input).toHaveValue(before);
			await page.keyboard.press("Control+Shift+z");
			await expect(input).toHaveValue(after);
		});
	}
}

test("extension icon toggles the menu; disable persists and can be reversed", async ({
	page,
}) => {
	const menu = page.locator("#os-pen-shortcut-sidebar");
	await expect(menu).toHaveCount(0);
	await page.evaluate(() => (window as any).clickExtensionIcon());
	await expect(menu).toBeVisible();
	await page.evaluate(() => (window as any).clickExtensionIcon());
	await expect(menu).toHaveCount(0);
	await page.evaluate(() => (window as any).clickExtensionIcon());
	await expect(menu).toBeVisible();
	await Promise.all([
		page.waitForEvent("load"),
		page.getByRole("button", { name: "Disable extension" }).click(),
	]);
	await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
	await expect(page.locator("#os-onshape-theme")).toHaveCount(0);
	await expect(page.locator("#os-onshape-page-bridge")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Collapse sketch panel" }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Enable extension" }),
	).toHaveCount(0);
	await page.evaluate(() => (window as any).clickExtensionIcon());
	await expect(
		page.getByRole("button", { name: "Enable extension" }),
	).toBeVisible();
	await page.reload();
	await expect(page.locator("#onshape-extension-host")).toHaveCount(1);
	await expect(page.locator("#os-onshape-theme")).toHaveCount(0);
	await page.evaluate(() => (window as any).clickExtensionIcon());
	await page.getByRole("button", { name: "Enable extension" }).click();
	await expect(
		page.getByRole("button", { name: "Collapse sketch panel" }),
	).toBeVisible();
	await expect(menu).toHaveCount(0);
});
