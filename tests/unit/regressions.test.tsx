import "../../public/keyboard-guard.js";
import React from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useFloatingCadKeyboard } from "@/components/floating-cad-keyboard/useFloatingCadKeyboard";
import { SketchToolbarCollapser } from "@/components/SketchToolbarCollapser";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/contexts/ExtensionSettingsContext", () => ({
	useExtensionSettings: () => ({
		settings: {
			sketchToolbarCollapsed: false,
			keyboardShortcuts: {},
		},
		setSetting: vi.fn(),
	}),
}));
vi.mock("@/contexts/OnshapeBridgeContext", () => ({
	useOnshapeBridge: () => ({ toolbarType: "Sketch" }),
}));
vi.mock("@/contexts/SettingsDialogContext", () => ({
	useSettingsDialog: () => ({ openSettings: vi.fn() }),
}));

let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
	frames = new Map();
	let id = 0;
	vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
		frames.set(++id, fn);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});
function flushFrames() {
	act(() => {
		const pending = [...frames.values()];
		frames.clear();
		pending.forEach((fn) => fn(0));
	});
}
function input() {
	const el = document.createElement("input");
	el.value = "12345";
	document.body.append(el);
	return el;
}

test.each([
	["ArrowLeft", 1],
	["ArrowRight", 4],
] as const)("%s collapses selected text to the corresponding edge", (key, expected) => {
	const { result } = renderHook(useFloatingCadKeyboard);
	const el = input();
	act(() => el.focus());
	flushFrames();
	el.setSelectionRange(1, 4);
	act(() => result.current.sendCadKey({ label: key, key }));
	expect([el.selectionStart, el.selectionEnd]).toEqual([expected, expected]);
});
test.each([
	["ArrowLeft", 0, 0],
	["ArrowLeft", 3, 2],
	["ArrowRight", 3, 4],
	["ArrowRight", 5, 5],
] as const)("%s moves a collapsed caret from %i to %i", (key, start, expected) => {
	const { result } = renderHook(useFloatingCadKeyboard);
	const el = input();
	act(() => el.focus());
	flushFrames();
	el.setSelectionRange(start, start);
	act(() => result.current.sendCadKey({ label: key, key }));
	expect(el.selectionStart).toBe(expected);
});
test("blur before the next frame must not show a ghost keypad", () => {
	const { result } = renderHook(useFloatingCadKeyboard);
	const el = input();
	act(() => {
		el.focus();
		el.blur();
	});
	flushFrames();
	expect(result.current.isVisible).toBe(false);
});
test("a detached input must not show the keypad", () => {
	const { result } = renderHook(useFloatingCadKeyboard);
	const el = input();
	act(() => {
		el.focus();
		el.remove();
	});
	flushFrames();
	expect(result.current.isVisible).toBe(false);
});
test("unmount cancels the pending focus frame", () => {
	const { unmount } = renderHook(useFloatingCadKeyboard);
	act(() => input().focus());
	unmount();
	expect(frames.size).toBe(0);
});
test("collapse control is outside the native header and its finish/cancel buttons", () => {
	document.body.innerHTML =
		'<div id="feature-dialog"><div class="ns-dialog-header"></div></div>';
	vi.spyOn(
		document.querySelector(".ns-dialog-header")!,
		"getBoundingClientRect",
	).mockReturnValue({
		top: 100,
		right: 500,
		left: 200,
		bottom: 132,
		width: 300,
		height: 32,
		x: 200,
		y: 100,
		toJSON() {},
	});
	const view = render(
		<TooltipProvider>
			<SketchToolbarCollapser />
		</TooltipProvider>,
	);
	const button = view.getByRole("button", { name: "Collapse sketch panel" });
	expect(parseFloat(button.style.left)).toBeGreaterThanOrEqual(504);
});
test("editable extension events do not reach native bubbling shortcuts", () => {
	render(<KeyboardShortcuts />);
	const host = document.createElement("div");
	host.id = "onshape-extension-host";
	document.body.append(host);
	const shadow = host.attachShadow({ mode: "open" });
	const el = document.createElement("input");
	shadow.append(el);
	const native = vi.fn();
	document.addEventListener("keydown", native);
	try {
		el.dispatchEvent(
			new KeyboardEvent("keydown", { key: "l", bubbles: true, composed: true }),
		);
		expect(native).not.toHaveBeenCalled();
	} finally {
		document.removeEventListener("keydown", native);
	}
});
test.each([
	["9", "9", "insertText"],
	["Backspace", undefined, "delete"],
	["Clear", undefined, "delete"],
] as const)("%s uses a browser editing transaction", (key, value, command) => {
	const exec = vi.fn(() => true);
	vi.stubGlobal("document", document);
	Object.defineProperty(document, "execCommand", {
		configurable: true,
		value: exec,
	});
	const { result } = renderHook(useFloatingCadKeyboard);
	const el = input();
	act(() => el.focus());
	flushFrames();
	el.setSelectionRange(1, 4);
	act(() => result.current.sendCadKey({ label: key, key, value }));
	expect(exec).toHaveBeenCalledWith(command, false, value);
});

test.each([
	"keydown",
	"keypress",
	"keyup",
])("%s stays inside the shadow tree and reaches local handlers", (type) => {
	const host = document.createElement("div");
	host.id = "onshape-extension-host";
	document.body.append(host);
	const shadow = host.attachShadow({ mode: "open" });
	const el = document.createElement("textarea");
	shadow.append(el);
	const local = vi.fn((event: Event) => event.preventDefault());
	const native = vi.fn();
	shadow.addEventListener(type, local);
	window.addEventListener(type, native, true);
	try {
		const original = new KeyboardEvent(type, {
			key: "d",
			bubbles: true,
			composed: true,
			cancelable: true,
		});
		el.dispatchEvent(original);
		expect(local).toHaveBeenCalledOnce();
		expect(native).not.toHaveBeenCalled();
		expect(original.defaultPrevented).toBe(true);
	} finally {
		window.removeEventListener(type, native, true);
	}
});

test("native inputs and extension shortcut-capture buttons keep their keyboard events", () => {
	const host = document.createElement("div");
	host.id = "onshape-extension-host";
	document.body.append(host);
	const shadow = host.attachShadow({ mode: "open" });
	const button = document.createElement("button");
	shadow.append(button);
	const native = vi.fn();
	window.addEventListener("keydown", native, true);
	try {
		input().dispatchEvent(
			new KeyboardEvent("keydown", { key: "l", bubbles: true, composed: true }),
		);
		button.dispatchEvent(
			new KeyboardEvent("keydown", { key: "l", bubbles: true, composed: true }),
		);
		expect(native).toHaveBeenCalledTimes(2);
	} finally {
		window.removeEventListener("keydown", native, true);
	}
});

test("cancelled beforeinput prevents a keypad edit", () => {
	const exec = vi.fn(() => true);
	Object.defineProperty(document, "execCommand", {
		configurable: true,
		value: exec,
	});
	const { result } = renderHook(useFloatingCadKeyboard);
	const el = input();
	act(() => el.focus());
	flushFrames();
	el.addEventListener("beforeinput", (event) => event.preventDefault());
	act(() => result.current.sendCadKey({ label: "9", key: "9", value: "9" }));
	expect(exec).not.toHaveBeenCalled();
	expect(el.value).toBe("12345");
});

test("rapidly switching inputs edits only the latest focused input", () => {
	const { result } = renderHook(useFloatingCadKeyboard);
	const first = input();
	const second = input();
	act(() => {
		first.focus();
		second.focus();
	});
	flushFrames();
	expect(result.current.isVisible).toBe(true);
	expect(result.current.activeInputRef.current).toBe(second);
	act(() => result.current.hideKeyboard());
	flushFrames();
	expect(result.current.isVisible).toBe(false);
});
