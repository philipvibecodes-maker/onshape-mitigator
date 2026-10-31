import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, loadSettings, migrateSettings } from "../../src/storage";
import {
  eventToBinding,
  matchesBinding,
  parseBinding,
} from "../../src/shortcuts";
import {
  buildChatbotUrl,
  formatContextAsMarkdown,
  parseOnshapeUrl,
  type AiContextSnapshot,
} from "../../src/aiContext";
import { readPage } from "../../src/adapter/client";
import { isRequest, REQUEST, RESPONSE } from "../../src/adapter/protocol";
import { handleRead, readState, readSelections } from "../../src/adapter/page";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete window.angular;
});
describe("settings compatibility", () => {
  it("migrates only retained preferences and fills missing bindings", () => {
    const settings = migrateSettings({
      settingsVersion: 2,
      extensionEnabled: false,
      sketchToolbarCollapsed: true,
      theme: "dark",
      aiChatbotUrl: "https://example.com/",
      aiOpenAfterCopy: false,
      keyboardShortcuts: {
        togglePenSidebar: "Alt+B",
        openVariablesTable: "Ctrl+V",
      },
    });
    expect(settings).toMatchObject({
      settingsVersion: 3,
      extensionEnabled: false,
      sketchToolbarCollapsed: true,
      aiChatbotUrl: "https://example.com/",
      aiOpenAfterCopy: false,
    });
    expect(settings.keyboardShortcuts).toEqual({
      ...DEFAULTS.keyboardShortcuts,
      openVariablesTable: "Ctrl+V",
    });
    expect(settings).not.toHaveProperty("theme");
  });
  it("preserves cleared bindings and handles malformed or duplicate data", () => {
    const settings = migrateSettings({
      extensionEnabled: "false",
      keyboardShortcuts: {
        openExtensionMenu: "",
        openSettings: "Alt+V",
        copyAiContext: 4,
        toggleSketchToolbar: "Wrong+T",
      },
    });
    expect(settings.extensionEnabled).toBe(true);
    expect(settings.keyboardShortcuts.openExtensionMenu).toBe("");
    expect(settings.keyboardShortcuts.openSettings).toBe("");
    expect(settings.keyboardShortcuts.toggleSketchToolbar).toBe("Alt+Shift+T");
  });
  it("persists a migration and leaves old unrelated values untouched", async () => {
    localStorage.setItem("extension:theme", JSON.stringify("dark"));
    await loadSettings();
    expect(JSON.parse(localStorage.getItem("extension:settingsVersion")!)).toBe(
      3,
    );
    expect(JSON.parse(localStorage.getItem("extension:theme")!)).toBe("dark");
  });
});
describe("shortcut bindings", () => {
  it("matches modifiers exactly and normalizes letters and plus", () => {
    expect(
      matchesBinding(
        new KeyboardEvent("keydown", { key: "v", altKey: true }),
        "Alt+V",
      ),
    ).toBe(true);
    expect(
      matchesBinding(
        new KeyboardEvent("keydown", {
          key: "v",
          altKey: true,
          shiftKey: true,
        }),
        "Alt+V",
      ),
    ).toBe(false);
    expect(
      eventToBinding(new KeyboardEvent("keydown", { key: "+", ctrlKey: true })),
    ).toBe("Ctrl+Plus");
    expect(parseBinding("Wrong+T")).toBeNull();
    expect(
      eventToBinding(new KeyboardEvent("keydown", { key: "Shift" })),
    ).toBeNull();
  });
});
describe("context formatting", () => {
  it.each(["w", "v", "m"])("parses %s references", (ref) =>
    expect(
      parseOnshapeUrl(`https://cad.onshape.com/documents/d/${ref}/r/e/e`),
    ).toEqual({
      documentId: "d",
      referenceType: ref,
      referenceId: "r",
      elementId: "e",
    }),
  );
  it("formats partial snapshots without claiming selections are known empty", () => {
    const snapshot: AiContextSnapshot = {
      capturedAt: "now",
      url: "https://cad.onshape.com/",
      ids: {
        documentId: null,
        referenceType: null,
        referenceId: null,
        elementId: null,
      },
      documentTitle: "Test",
      documentName: null,
      elementName: null,
      toolbarType: null,
      currentTool: null,
      featureDialogOpen: false,
      selections: [],
      features: [],
      variables: [],
    };
    const markdown = formatContextAsMarkdown(snapshot);
    expect(markdown).toContain("Workspace mode: unknown");
    expect(markdown).toContain("selection data may be unavailable");
    expect(markdown).toContain("please wait for it");
  });
  it("caps encoded context safely, including emoji and split surrogate pairs", () => {
    const url = buildChatbotUrl(
      "https://chatgpt.com/?q={context}",
      "😀𐐷".repeat(10000),
    );
    expect(url.length).toBeLessThanOrEqual(6000);
    expect(() => decodeURIComponent(url)).not.toThrow();
    expect(buildChatbotUrl("https://example.com/", "secret")).toBe(
      "https://example.com/",
    );
  });
});
describe("read-only adapter", () => {
  it("rejects command endpoints and malformed read requests", () => {
    expect(
      isRequest({ type: "OS_EXECUTE_COMMAND", requestId: "id", kind: "state" }),
    ).toBe(false);
    expect(isRequest({ type: REQUEST, requestId: 4, kind: "state" })).toBe(
      false,
    );
  });
  it("reads initial state without toolbar events and never replaces broadcasts", () => {
    const broadcast = vi.fn();
    window.angular = {
      element: () => ({
        injector: () => ({
          get: (name) =>
            name === "ElementToolbarService"
              ? { toolbarName: "Sketch", currentTool: "LINESEGMENT" }
              : { $on: () => () => {}, $broadcast: broadcast },
        }),
      }),
    };
    expect(readState()).toEqual({
      ready: true,
      toolbarType: "Sketch",
      currentTool: "LINESEGMENT",
    });
    expect(broadcast).not.toHaveBeenCalled();
  });
  it("returns partial state when Angular is absent", () => {
    expect(readState().ready).toBe(false);
    expect(readSelections()).toEqual([]);
  });
  it("ignores foreign sources, foreign origins, and arbitrary execution", () => {
    const post = vi.spyOn(window, "postMessage");
    for (const options of [
      {
        source: null,
        origin: location.origin,
        data: { type: REQUEST, requestId: "a", kind: "state" },
      },
      {
        source: window,
        origin: "https://other.example",
        data: { type: REQUEST, requestId: "b", kind: "state" },
      },
      {
        source: window,
        origin: location.origin,
        data: { type: "OS_EXECUTE_COMMAND", requestId: "c", kind: "state" },
      },
    ])
      handleRead(new MessageEvent("message", options));
    expect(post).not.toHaveBeenCalled();
  });
  it("correlates and validates replies before resolving", async () => {
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const pending = readPage("state", 100);
    const request = post.mock.calls[0][0];
    const send = (data: unknown) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: location.origin,
          data,
        }),
      );
    send({
      type: RESPONSE,
      requestId: "wrong",
      kind: "state",
      data: { ready: true, toolbarType: "Sketch", currentTool: null },
    });
    send({
      type: RESPONSE,
      requestId: request.requestId,
      kind: "state",
      data: { ready: "yes", toolbarType: "Sketch", currentTool: null },
    });
    send({
      type: RESPONSE,
      requestId: request.requestId,
      kind: "state",
      data: { ready: true, toolbarType: "Assembly", currentTool: null },
    });
    await expect(pending).resolves.toEqual({
      ready: true,
      toolbarType: "Assembly",
      currentTool: null,
    });
  });
  it("times out and removes its listener", async () => {
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
    const remove = vi.spyOn(window, "removeEventListener");
    await expect(readPage("selections", 5)).resolves.toEqual([]);
    expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
