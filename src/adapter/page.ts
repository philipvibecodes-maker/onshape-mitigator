// Narrow page-context adapter. It exposes reads and one validated graphics action.
import {
  isRequest,
  isSetDimensionsHiddenRequest,
  RESPONSE,
} from "./protocol";
import type {
  ModelData,
  OnshapeState,
  OnshapeToolbarMode,
  Selection,
} from "../types";
type Service = Record<string, any>;
type Injector = { get(name: string): Service };
type DimensionElement = { hide?: () => void; show?: () => void };
type DimensionViewer = {
  getUiElements?: () => Record<string, unknown>;
  addUIElement?: (element: unknown) => void;
  forceRequestDraw?: () => void;
};
declare global {
  interface Window {
    angular?: { element(node: Document): { injector(): Injector | undefined } };
    __mitigatorAdapter?: boolean;
    btTs?: {
      graphics?: {
        dimensions?: {
          Dimension?: new (...args: never[]) => unknown;
          getActiveViewer?: () => DimensionViewer | null;
        };
      };
    };
  }
}
export function getInjector(): Injector | undefined {
  try {
    return window.angular?.element(document).injector();
  } catch {
    return undefined;
  }
}
function service(
  injector: Injector | undefined,
  name: string,
): Service | undefined {
  try {
    return injector?.get(name);
  } catch {
    return undefined;
  }
}
function mode(value: unknown): OnshapeToolbarMode | null {
  return ["Sketch", "Part Studio", "Assembly", "Drawing"].includes(
    value as string,
  )
    ? (value as OnshapeToolbarMode)
    : null;
}
let toolbarType: OnshapeToolbarMode | null = null;
let currentTool: string | null = null;
let lastRoute = location.href;
let subscribedRoot: Service | undefined;
let unsubscribe: (() => void)[] = [];
function attach(injector: Injector | undefined): void {
  const root = service(injector, "$rootScope");
  if (root === subscribedRoot) return;
  unsubscribe.forEach((off) => off());
  unsubscribe = [];
  subscribedRoot = root;
  if (!root || typeof root.$on !== "function") return;
  const listen = (name: string, handler: (...args: any[]) => void) => {
    unsubscribe.push(
      root.$on(name, (_event: unknown, ...args: any[]) => handler(...args)),
    );
  };
  listen("CHANGE_ELEMENT_TOOLBAR", (data) => {
    toolbarType = mode(data?.toolbarName);
    currentTool = null;
  });
  listen("ELEMENT_TOOLBAR_SET_CURRENT_TOOL", (value) => {
    currentTool = typeof value === "string" ? value : null;
  });
  listen("ELEMENT_TOOLBAR_EXIT_CURRENT_TOOL", () => {
    currentTool = null;
  });
  listen("ADD_NEW_FEATURE", (value) => {
    currentTool = typeof value?.command === "string" ? value.command : null;
  });
  listen("DOCUMENT_UNLOADED", () => {
    toolbarType = null;
    currentTool = null;
  });
}
export function readState(): OnshapeState {
  if (lastRoute !== location.href) {
    lastRoute = location.href;
    toolbarType = null;
    currentTool = null;
  }
  const injector = getInjector();
  attach(injector);
  if (!injector) {
    toolbarType = null;
    currentTool = null;
    return { ready: false, toolbarType: null, currentTool: null };
  }
  const toolbar = service(injector, "ElementToolbarService");
  // Read initial state when the content script arrives after toolbar setup.
  const initialMode =
    mode(toolbar?.toolbarName) ??
    mode(toolbar?.toolbarType) ??
    mode(toolbar?.currentToolbar?.toolbarName);
  if (initialMode) toolbarType = initialMode;
  const initialTool = toolbar?.currentTool;
  if (typeof initialTool === "string" || initialTool === null)
    currentTool = initialTool;
  return { ready: !!injector, toolbarType, currentTool };
}
export function readSelections(): Selection[] {
  const selections =
    service(getInjector(), "SelectionService")?.[
      "constructor"
    ]?.getCurrentSelections?.() ?? [];
  if (!Array.isArray(selections)) return [];
  return selections.flatMap((s: Service) => {
    try {
      const kinds = [
        ["isFace", "face"],
        ["isEdge", "edge"],
        ["isVertex", "vertex"],
        ["isSketchFeature", "sketch"],
        ["isUserSketchEntity", "sketch-entity"],
        ["isBody", "body"],
        ["isMateConnector", "mate-connector"],
        ["isFeature", "feature"],
      ];
      const kind =
        kinds.find(
          ([method]) => typeof s[method] === "function" && s[method](),
        )?.[1] ?? "unknown";
      const id = s.getIdString?.(),
        name = s.getName?.();
      return [
        {
          kind,
          ...(typeof id === "string" ? { id } : {}),
          ...(typeof name === "string" ? { name } : {}),
        },
      ];
    } catch {
      return [];
    }
  });
}
function readModelUrl(): string | null {
  const match = location.pathname.match(
    /\/documents\/([^/]+)\/(w|v)\/([^/]+)\/e\/([^/?#]+)/,
  );
  if (!match) return null;
  const [, documentId, referenceType, referenceId, elementId] = match;
  return `/api/partstudios/d/${documentId}/${referenceType}/${referenceId}/e/${elementId}`;
}
async function readModel(): Promise<ModelData> {
  const base = readModelUrl();
  if (!base) return { features: null, variables: null };
  const readJson = async (resource: string): Promise<unknown | null> => {
    try {
      const response = await fetch(`${base}/${resource}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > 2_000_000) return null;
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
  const [features, variables] = await Promise.all([
    readJson("features"),
    readJson("variables"),
  ]);
  return { features, variables };
}
let hookedViewer: DimensionViewer | null = null;
let originalAddUIElement: DimensionViewer["addUIElement"];
const originalDimensionShows = new Map<DimensionElement, () => void>();
function preventDimensionShowing(dimension: DimensionElement): void {
  if (originalDimensionShows.has(dimension)) return;
  const show = dimension.show;
  if (typeof show !== "function") return;
  originalDimensionShows.set(dimension, show);
  dimension.show = () => {};
}
function restoreDimensionShows(): void {
  for (const [dimension, show] of originalDimensionShows)
    dimension.show = show;
  originalDimensionShows.clear();
}
function removeDimensionCreationHook(): void {
  if (hookedViewer && originalAddUIElement)
    hookedViewer.addUIElement = originalAddUIElement;
  hookedViewer = null;
  originalAddUIElement = undefined;
}
export function setSketchDimensionsHidden(hidden: boolean): number {
  const graphics = window.btTs?.graphics?.dimensions;
  const Dimension = graphics?.Dimension;
  const viewer = graphics?.getActiveViewer?.();
  if (!Dimension || !viewer) return 0;
  if (!hidden) {
    removeDimensionCreationHook();
    restoreDimensionShows();
  }
  else if (hookedViewer !== viewer) {
    removeDimensionCreationHook();
    const addUIElement = viewer.addUIElement;
    if (typeof addUIElement === "function") {
      hookedViewer = viewer;
      originalAddUIElement = addUIElement;
      viewer.addUIElement = (element) => {
        addUIElement.call(viewer, element);
        if (element instanceof Dimension) {
          const dimension = element as DimensionElement;
          preventDimensionShowing(dimension);
          dimension.hide?.call(dimension);
        }
      };
    }
  }
  let changed = 0;
  for (const element of Object.values(viewer.getUiElements?.() ?? {})) {
    if (!(element instanceof Dimension)) continue;
    const dimension = element as DimensionElement;
    if (hidden) preventDimensionShowing(dimension);
    const update = hidden ? dimension.hide : dimension.show;
    if (typeof update !== "function") continue;
    update.call(dimension);
    changed++;
  }
  if (changed) viewer.forceRequestDraw?.();
  return changed;
}
export function handleRead(event: MessageEvent): void {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    !isRequest(event.data)
  )
    return;
  const { requestId, kind } = event.data;
  if (kind === "model") {
    void readModel().then((data) =>
      window.postMessage(
        { type: RESPONSE, requestId, kind, data },
        location.origin,
      ),
    );
    return;
  }
  let data: OnshapeState | Selection[] | ModelData;
  try {
    data =
      kind === "state"
        ? readState()
        : readSelections();
  } catch {
    data =
      kind === "state"
        ? { ready: false, toolbarType: null, currentTool: null }
        : [];
  }
  window.postMessage(
    { type: RESPONSE, requestId, kind, data },
    location.origin,
  );
}
export function handleSetDimensionsHidden(event: MessageEvent): void {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    !isSetDimensionsHiddenRequest(event.data)
  )
    return;
  setSketchDimensionsHidden(event.data.hidden);
}
if (!window.__mitigatorAdapter) {
  window.__mitigatorAdapter = true;
  window.addEventListener("message", handleRead);
  window.addEventListener("message", handleSetDimensionsHidden);
}
