import { parseTestState, sanitizeStateDom, type TestState } from "../../src/testState";

function fitCapturedViewport(viewport: TestState["viewport"]): void {
  const fit = () => {
    const scale = Math.min(1, innerWidth / viewport.width, innerHeight / viewport.height);
    document.body.style.zoom = String(scale);
    scrollTo(0, 0);
  };
  fit();
  window.addEventListener("resize", fit);
}

export async function loadTestState(input: unknown): Promise<TestState> {
  const snapshot = parseTestState(JSON.stringify(input));
  const parsed = new DOMParser().parseFromString(snapshot.html, "text/html");
  sanitizeStateDom(parsed.body);
  // A fresh page per capture ensures React roots, observers, and bridge state
  // from the previous replay cannot leak into the next one.
  if (document.getElementById("onshape-extension-host"))
    throw new Error("Reload the viewer before opening another state.");
  document.body.replaceWith(document.adoptNode(parsed.body));
  fitCapturedViewport(snapshot.viewport);
  document.title = `${snapshot.name} — offline replay`;
  window.addEventListener("popstate", () => location.reload(), { once: true });
  history.pushState({ offlineReplay: true }, "", snapshot.path);
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index)!;
    if (key.startsWith("extension:")) localStorage.removeItem(key);
  }
  const services: Record<string, unknown> = {
    ElementToolbarService: {
      toolbarName: snapshot.state.toolbarType,
      currentTool: snapshot.state.currentTool,
    },
    SelectionService: {
      constructor: { getCurrentSelections: () => snapshot.selections.map((selection) => ({
        getIdString: () => selection.id,
        getName: () => selection.name,
        isFace: () => selection.kind === "face",
        isEdge: () => selection.kind === "edge",
        isVertex: () => selection.kind === "vertex",
        isSketchFeature: () => selection.kind === "sketch",
        isUserSketchEntity: () => selection.kind === "sketch-entity",
        isBody: () => selection.kind === "body",
        isMateConnector: () => selection.kind === "mate-connector",
        isFeature: () => selection.kind === "feature",
      })) },
    },
  };
  if (snapshot.state.ready) window.angular = {
    element: () => ({ injector: () => ({ get: (name: string) => services[name] as Record<string, any> }) }),
  };
  else delete window.angular;
  const originalFetch = window.fetch.bind(window);
  const modelPath = snapshot.path.replace(/^\/documents\//, "/api/partstudios/d/");
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin) throw new Error("External requests are disabled during replay.");
    if (url.pathname.startsWith("/api/")) {
      const value = url.pathname === `${modelPath}/features` ? snapshot.model.features
        : url.pathname === `${modelPath}/variables` ? snapshot.model.variables : null;
      return new Response(JSON.stringify(value), { status: value === null ? 503 : 200 });
    }
    return originalFetch(input, init);
  };
  // Recorded markup is static: prevent form navigation and links from leaving
  // the local harness. Plugin buttons and keyboard handlers still work.
  document.addEventListener("submit", (event) => event.preventDefault(), true);
  document.addEventListener("click", (event) => {
    if ((event.target as Element).closest?.("a")) event.preventDefault();
  });
  await import("../../src/adapter/page");
  await import("../../src/main");
  const { clickExtensionIcon } = await import("../fixture/browser");
  (window as any).clickExtensionIcon = clickExtensionIcon;
  return snapshot;
}
