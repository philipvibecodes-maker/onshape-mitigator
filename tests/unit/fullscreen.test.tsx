import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useFullscreenEscape } from "@/core/fullscreen";

let fullscreen: Element | null;
let lock: ReturnType<typeof vi.fn>;
let unlock: ReturnType<typeof vi.fn>;
let exit: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.useFakeTimers();
	fullscreen = document.documentElement;
	lock = vi.fn().mockResolvedValue(undefined);
	unlock = vi.fn();
	exit = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(document, "fullscreenElement", {
		configurable: true,
		get: () => fullscreen,
	});
	Object.defineProperty(document, "exitFullscreen", {
		configurable: true,
		value: exit,
	});
	Object.defineProperty(navigator, "keyboard", {
		configurable: true,
		value: { lock, unlock },
	});
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	document.body.innerHTML = "";
	delete (navigator as any).keyboard;
	delete (document as any).fullscreenElement;
	delete (document as any).exitFullscreen;
});
function escape(repeat = false) {
	const event = new KeyboardEvent("keydown", {
		key: "Escape",
		bubbles: true,
		cancelable: true,
		repeat,
	});
	document.body.dispatchEvent(event);
	return event;
}
async function ready(tool: string | null = null) {
	const view = renderHook(({ tool }) => useFullscreenEscape(tool), {
		initialProps: { tool },
	});
	await Promise.resolve();
	return view;
}

test("locks only Escape and exits when there is no cancellable mode", async () => {
	await ready();
	expect(lock).toHaveBeenCalledWith(["Escape"]);
	escape();
	await vi.runAllTimersAsync();
	expect(exit).toHaveBeenCalledOnce();
});
test("tool cancellation gets Escape; repeats cannot exit after cancellation", async () => {
	const view = await ready("line");
	const native = vi.fn();
	document.body.addEventListener("keydown", native);
	escape();
	view.rerender({ tool: null });
	escape(true);
	await vi.runAllTimersAsync();
	expect(native).toHaveBeenCalledTimes(2);
	expect(exit).not.toHaveBeenCalled();
	escape();
	await vi.runAllTimersAsync();
	expect(exit).toHaveBeenCalledOnce();
});
test.each([
	"feature-dialog",
	"menu",
	"dialog",
])("snapshots visible %s before Onshape removes it", async (kind) => {
	await ready();
	const element = document.createElement("div");
	if (kind === "feature-dialog") element.id = kind;
	else element.setAttribute("role", kind);
	document.body.append(element);
	vi.spyOn(element, "getClientRects").mockReturnValue([{}] as any);
	document.body.addEventListener("keydown", () => element.remove(), {
		once: true,
	});
	escape();
	await vi.runAllTimersAsync();
	expect(exit).not.toHaveBeenCalled();
});
test("hidden dialogs do not prevent fullscreen exit", async () => {
	await ready();
	document.body.innerHTML = '<div id="feature-dialog" hidden></div>';
	escape();
	await vi.runAllTimersAsync();
	expect(exit).toHaveBeenCalledOnce();
});
test("a native handler can consume Escape without a known mode", async () => {
	await ready();
	document.body.addEventListener("keydown", (event) => event.preventDefault(), {
		once: true,
	});
	escape();
	await vi.runAllTimersAsync();
	expect(exit).not.toHaveBeenCalled();
});
test.each([
	"denied",
	"unsupported",
])("%s lock retains browser behavior", async (mode) => {
	if (mode === "denied") lock.mockRejectedValue(new Error("denied"));
	else delete (navigator as any).keyboard;
	await ready();
	escape();
	await vi.runAllTimersAsync();
	expect(exit).not.toHaveBeenCalled();
});
test("unlocks and clears styling when fullscreen ends while menu is hidden", async () => {
	const view = await ready();
	expect(document.body.classList.contains("onshape-plus-fullscreen-mode")).toBe(
		true,
	);
	fullscreen = null;
	document.dispatchEvent(new Event("fullscreenchange"));
	expect(unlock).toHaveBeenCalled();
	expect(document.body.classList.contains("onshape-plus-fullscreen-mode")).toBe(
		false,
	);
	view.unmount();
});
test("a pending lock resolving after unmount is released", async () => {
	let resolve!: () => void;
	lock.mockReturnValue(
		new Promise<void>((done) => {
			resolve = done;
		}),
	);
	const view = await ready();
	view.unmount();
	unlock.mockClear();
	resolve();
	await Promise.resolve();
	expect(unlock).toHaveBeenCalledOnce();
});
