// Read-only page-context adapter. No arbitrary command or broadcast endpoint.
import { isRequest, RESPONSE } from "./protocol";
import type { OnshapeState, OnshapeToolbarMode, Selection } from "../types";
type Service = Record<string, any>;
type Injector = { get(name: string): Service };
declare global {
  interface Window {
    angular?: { element(node: Document): { injector(): Injector | undefined } };
    __mitigatorAdapter?: boolean;
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
export function handleRead(event: MessageEvent): void {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    !isRequest(event.data)
  )
    return;
  const { requestId, kind } = event.data;
  let data: OnshapeState | Selection[];
  try {
    data = kind === "state" ? readState() : readSelections();
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
if (!window.__mitigatorAdapter) {
  window.__mitigatorAdapter = true;
  window.addEventListener("message", handleRead);
}
