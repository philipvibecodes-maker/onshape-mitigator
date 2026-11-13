import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULTS,
  DEFAULT_NUMPAD_VIEW_MAPPINGS,
  loadSettings,
  migrateSettings,
} from "../../src/storage";
import {
  eventToBinding,
  matchesBinding,
  parseBinding,
} from "../../src/shortcuts";
import {
  buildChatbotUrl,
  findSketchDefinition,
  formatContextAsMarkdown,
  parseOnshapeUrl,
  type AiContextSnapshot,
} from "../../src/aiContext";
import { readPage } from "../../src/adapter/client";
import {
  isRequest,
  isSetDimensionsHiddenRequest,
  isExecuteStandardViewRequest,
  EXECUTE_STANDARD_VIEW,
  REQUEST,
  RESPONSE,
  SET_DIMENSIONS_HIDDEN,
} from "../../src/adapter/protocol";
import {
  executeStandardView,
  handleRead,
  readState,
  readSelections,
  setSketchDimensionsHidden,
} from "../../src/adapter/page";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete window.angular;
  delete window.btTs;
});
describe("settings compatibility", () => {
  it("uses Alt+S to open settings by default", () => {
    expect(DEFAULTS.keyboardShortcuts.openSettings).toBe("Alt+S");
    expect(DEFAULTS.keyboardShortcuts.toggleSketchDimensions).toBe(
      "Alt+Shift+D",
    );
  });

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
      settingsVersion: 4,
      extensionEnabled: false,
      sketchToolbarCollapsed: true,
      sketchDimensionsHidden: false,
      aiChatbotUrl: "https://example.com/",
      aiOpenAfterCopy: false,
    });
    expect(settings.keyboardShortcuts).toEqual({
      ...DEFAULTS.keyboardShortcuts,
      openVariablesTable: "Ctrl+V",
    });
    expect(settings.numpadViewMappings).toEqual(
      DEFAULT_NUMPAD_VIEW_MAPPINGS,
    );
    expect(settings).not.toHaveProperty("theme");
  });
  it("preserves valid numpad mappings and repairs malformed values", () => {
    const settings = migrateSettings({
      settingsVersion: 4,
      numpadViewMappings: {
        Numpad0: "right",
        Numpad1: null,
        Numpad2: "diagonal",
      },
    });
    expect(settings.numpadViewMappings).toEqual({
      ...DEFAULT_NUMPAD_VIEW_MAPPINGS,
      Numpad0: "right",
      Numpad1: null,
    });
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
      4,
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
      scope: "document",
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
      model: { features: null, variables: null },
      viewport: {
        camera: {
          namedView: "Trimetric",
          position: null,
          target: null,
          up: null,
          projection: null,
        },
        canvas: { x: 100, y: 50, width: 800, height: 600 },
        visiblePanels: [],
      },
    };
    const markdown = formatContextAsMarkdown(snapshot);
    expect(markdown).toContain("Workspace mode: unknown");
    expect(markdown).toContain("selection data may be unavailable");
    expect(markdown).toContain("please wait for it");
    expect(markdown).toContain("Native feature definitions unavailable");
    expect(markdown).toContain("View orientation/preset: Trimetric");
    expect(markdown).toContain("800 × 600 CSS px");
    expect(markdown).toContain("Camera coordinates and projection: unavailable");
    expect(markdown).toContain("## Detailed JSON translation");
    expect(markdown).toContain(
      "The definitions below are translated semantic JSON",
    );
  });
  it("finds exact sketches in wrapped and flat feature responses", () => {
    const wrapped = {
      features: [
        {
          typeName: "BTMSketch",
          message: {
            featureId: "sketch-1",
            featureType: "newSketch",
            name: "Wrapped sketch",
          },
        },
      ],
    };
    const flat = {
      features: [
        {
          btType: "BTMSketch-151",
          featureId: "sketch-2",
          name: "Flat sketch",
        },
      ],
    };
    expect(findSketchDefinition(wrapped, "sketch-1")).toBe(
      wrapped.features[0],
    );
    expect(findSketchDefinition(flat, "sketch-2")).toBe(flat.features[0]);
  });
  it("rejects missing, non-sketch, malformed, and duplicate feature matches", () => {
    const extrude = {
      features: [
        { message: { featureId: "feature-1", featureType: "extrude" } },
      ],
    };
    const duplicate = {
      features: [
        { message: { featureId: "sketch-1", featureType: "newSketch" } },
        { message: { featureId: "sketch-1", featureType: "newSketch" } },
      ],
    };
    expect(findSketchDefinition(extrude, "missing")).toBeNull();
    expect(findSketchDefinition(extrude, "feature-1")).toBeNull();
    expect(findSketchDefinition(null, "sketch-1")).toBeNull();
    expect(findSketchDefinition({ features: {} }, "sketch-1")).toBeNull();
    expect(findSketchDefinition(duplicate, "sketch-1")).toBeNull();
  });
  it("formats only the isolated active sketch definition", () => {
    const snapshot: AiContextSnapshot = {
      scope: "sketch",
      capturedAt: "now",
      url: "https://cad.onshape.com/documents/doc/w/work/e/element",
      ids: {
        documentId: "doc",
        referenceType: "w",
        referenceId: "work",
        elementId: "element",
      },
      documentTitle: "Test",
      documentName: "Document sentinel",
      elementName: "Part Studio 1",
      toolbarType: "Sketch",
      currentTool: "LINESEGMENT",
      featureDialogOpen: true,
      selections: [
        { kind: "sketch-entity", id: "entity-1", name: "Sketch selection" },
        { kind: "face", id: "face-1", name: "DO NOT COPY Face" },
      ],
      sketch: {
        featureId: "sketch-1",
        name: "Sketch 1",
        definition: {
          type: 151,
          typeName: "BTMSketch",
          message: {
            featureId: "sketch-1",
            featureType: "newSketch",
            emptyName: "",
            subFeatures: [],
            emptyMetadata: {},
            parameters: [
              {
                typeName: "BTMParameterQueryList",
                message: { parameterId: "sketchPlane" },
              },
            ],
            entities: [{ entityId: "entity-1" }],
            constraints: [
              {
                typeName: "BTMSketchConstraint",
                message: {
                  constraintType: "COINCIDENT",
                  parameters: [
                    {
                      type: 149,
                      typeName: "BTMParameterString",
                      message: {
                        value: "entity-1",
                        parameterId: "localFirst",
                      },
                    },
                    {
                      type: 147,
                      typeName: "BTMParameterQuantity",
                      message: {
                        units: "",
                        value: 0,
                        expression: "20 mm",
                        isInteger: false,
                        parameterId: "length",
                      },
                    },
                  ],
                  hasOffsetData1: false,
                  offsetOrientation1: false,
                  offsetDistance1: 0,
                  hasOffsetData2: true,
                  offsetOrientation2: true,
                  offsetDistance2: 0.02,
                  hasPierceParameter: false,
                  pierceParameter: 0,
                },
              },
            ],
          },
        },
      },
    };
    const markdown = formatContextAsMarkdown(snapshot);
    const nativeJson =
      markdown.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "null";
    expect(markdown).toMatch(/^# Onshape Sketch Context/);
    expect(markdown).toContain("sketch-1");
    expect(markdown).toContain("Sketch 1");
    expect(markdown).toContain("entity-1");
    expect(markdown).toContain("COINCIDENT");
    expect(nativeJson).not.toContain("hasOffsetData1");
    expect(nativeJson).not.toContain("offsetOrientation1");
    expect(nativeJson).not.toContain("offsetDistance1");
    expect(nativeJson).not.toContain("hasPierceParameter");
    expect(nativeJson).not.toContain("pierceParameter");
    expect(nativeJson).toContain('"hasOffsetData2": true');
    expect(nativeJson).toContain('"offsetOrientation2": true');
    expect(nativeJson).toContain('"offsetDistance2": 0.02');
    expect(nativeJson).not.toMatch(/^\s*"type": \d+/m);
    expect(nativeJson).not.toContain('"emptyName"');
    expect(nativeJson).not.toContain('"subFeatures"');
    expect(nativeJson).not.toContain('"emptyMetadata"');
    expect(nativeJson).not.toContain('"units"');
    expect(nativeJson).not.toContain('"value": 0');
    expect(nativeJson).not.toContain('"isInteger"');
    expect(nativeJson).toContain('"expression":"20 mm"');
    expect(nativeJson).toMatch(/"constraints": \[\n/);
    const definition = JSON.parse(nativeJson);
    expect(definition.message).not.toHaveProperty("parameters");
    expect(definition.message.constraints[0].message.parameters).toEqual([
      {
        typeName: "BTMParameterString",
        message: { value: "entity-1", parameterId: "localFirst" },
      },
      {
        typeName: "BTMParameterQuantity",
        message: { expression: "20 mm", parameterId: "length" },
      },
    ]);
    expect(markdown).toContain("Sketch selection");
    expect(markdown).not.toContain("DO NOT COPY Face");
    expect(markdown).not.toContain("## Feature list");
    expect(markdown).not.toContain("## Variables");
    expect(markdown).not.toContain("## Viewport");
    expect(markdown).not.toContain("entire Part Studio");
    expect(markdown).toContain("## Native data compaction");
    expect(markdown).toContain("intentionally shortened");
    expect(markdown).toContain("Numeric `type`");
    expect(markdown).toContain("root `parameters` field");
    expect(markdown).toContain("`nodeId`");
    expect(markdown).toContain("`units`, normalized `value`, and `isInteger`");
    expect(markdown).toContain("`labelRatio`");
    expect(markdown).toContain("`hasOffsetDataN`");
    expect(markdown).toContain("`hasPierceParameter`");
  });
  it("fails closed when the active sketch definition is unavailable", () => {
    const snapshot: AiContextSnapshot = {
      scope: "sketch",
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
      toolbarType: "Sketch",
      currentTool: null,
      featureDialogOpen: false,
      selections: [],
      sketch: { featureId: null, name: null, definition: null },
    };
    const markdown = formatContextAsMarkdown(snapshot);
    expect(markdown).toContain("Active sketch definition unavailable.");
    expect(markdown).not.toContain("```json");
    expect(markdown).not.toContain("Native variable definitions");
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
describe("page adapter", () => {
  it("rejects arbitrary command endpoints and malformed read requests", () => {
    expect(
      isRequest({ type: "OS_EXECUTE_COMMAND", requestId: "id", kind: "state" }),
    ).toBe(false);
    expect(isRequest({ type: REQUEST, requestId: 4, kind: "state" })).toBe(
      false,
    );
    expect(
      isSetDimensionsHiddenRequest({
        type: SET_DIMENSIONS_HIDDEN,
        hidden: "yes",
      }),
    ).toBe(false);
    expect(
      isSetDimensionsHiddenRequest({
        type: SET_DIMENSIONS_HIDDEN,
        hidden: true,
      }),
    ).toBe(true);
    expect(
      isExecuteStandardViewRequest({
        type: EXECUTE_STANDARD_VIEW,
        view: "top",
      }),
    ).toBe(true);
    expect(
      isExecuteStandardViewRequest({
        type: EXECUTE_STANDARD_VIEW,
        view: "diagonal",
      }),
    ).toBe(false);
  });
  it("executes only validated standard views through Onshape's handler", () => {
    const handler = vi.fn();
    const getShortcutHandler = vi.fn(() => handler);
    window.angular = {
      element: () => ({
        injector: () => ({
          get: (name: string) =>
            name === "OnshapeShortcutHandlerService"
              ? { getShortcutHandler }
              : undefined,
        }),
      }),
    };
    expect(executeStandardView("top")).toBe(true);
    expect(getShortcutHandler).toHaveBeenCalledWith("topView");
    expect(handler).toHaveBeenCalledWith("topView");
  });
  it("hides and shows only native dimension elements", () => {
    class Dimension {
      hide = vi.fn();
      show = vi.fn();
    }
    const first = new Dimension();
    const second = new Dimension();
    const firstShow = first.show;
    const draw = vi.fn();
    const elements: Record<string, unknown> = { first, ignored: {}, second };
    const addUIElement = vi.fn((element: unknown) => {
      elements.added = element;
    });
    const viewer = {
      getUiElements: () => elements,
      addUIElement,
      forceRequestDraw: draw,
    };
    window.btTs = {
      graphics: {
        dimensions: {
          Dimension,
          getActiveViewer: () => viewer,
        },
      },
    };
    expect(setSketchDimensionsHidden(true)).toBe(2);
    expect(first.hide).toHaveBeenCalledOnce();
    expect(second.hide).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledOnce();
    first.show();
    expect(firstShow).not.toHaveBeenCalled();
    const added = new Dimension();
    viewer.addUIElement(added);
    expect(addUIElement).toHaveBeenCalledWith(added);
    expect(added.hide).toHaveBeenCalledOnce();
    expect(setSketchDimensionsHidden(false)).toBe(3);
    expect(first.show).toHaveBeenCalledOnce();
    expect(second.show).toHaveBeenCalledOnce();
    expect(added.show).toHaveBeenCalledOnce();
    const restored = new Dimension();
    viewer.addUIElement(restored);
    expect(restored.hide).not.toHaveBeenCalled();
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
