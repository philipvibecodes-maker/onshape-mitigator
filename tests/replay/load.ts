import { parseTestState, sanitizeStateDom, type TestState } from "../../src/testState";
import labels from "../../src/adapter/tool-labels.json";

function fitCapturedViewport(viewport: TestState["viewport"]): void {
  const fit = () => {
    const scale = Math.min(1, innerWidth / viewport.width, innerHeight / viewport.height);
    document.body.style.zoom = String(scale);
    scrollTo(0, 0);
  };
  fit();
  window.addEventListener("resize", fit);
}

function normalizeRecordedLayout(): void {
  for (const stats of document.querySelectorAll<HTMLElement>("os-public-stats")) {
    Object.assign(stats.style, {
      display: "flex",
      alignItems: "center",
      flexWrap: "nowrap",
      whiteSpace: "nowrap",
    });
    for (const child of stats.children) {
      if (!(child instanceof HTMLElement)) continue;
      Object.assign(child.style, {
        display: "inline-flex",
        alignItems: "center",
        flex: "0 0 auto",
      });
    }
  }
  for (const search of document.querySelectorAll<HTMLElement>(".command-search-trigger")) {
    search.style.whiteSpace = "nowrap";
    for (const child of search.querySelectorAll<HTMLElement>("span, .shortcut-key"))
      child.style.whiteSpace = "nowrap";
  }
}

function installRecordedTooltips(): void {
  const tooltip = document.createElement("div");
  tooltip.id = "offline-replay-tooltip";
  tooltip.role = "tooltip";
  Object.assign(tooltip.style, {
    position: "fixed",
    padding: "4px 8px",
    background: "#182231",
    color: "white",
    borderRadius: "5px",
    font: "12px system-ui",
    pointerEvents: "none",
    zIndex: "2147483647",
    maxWidth: "calc(100vw - 16px)",
    overflowWrap: "anywhere",
    display: "none",
  });
  document.documentElement.append(tooltip);
  let active: HTMLElement | null = null;
  const hide = () => {
    tooltip.style.display = "none";
    active = null;
  };
  const labelFor = (target: Element): { item: HTMLElement; label: string } | null => {
    for (let item: Element | null = target; item && item !== document.body; item = item.parentElement) {
      if (!(item instanceof HTMLElement)) continue;
      const icon = (item.getAttribute("icon") ?? "").replace(/^svg-icon-/, "");
      const label = item.getAttribute("aria-label") || item.getAttribute("title") ||
        (item.matches(".tool") ? item.querySelector<HTMLElement>(".tool-label")?.innerText.trim() : "") ||
        (labels as Record<string, string>)[icon];
      if (label) return { item, label };
    }
    return null;
  };
  const show = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("#onshape-extension-host")) return hide();
    const found = labelFor(target);
    if (!found) return hide();
    active = found.item;
    tooltip.textContent = found.label;
    tooltip.style.display = "block";
    const rect = found.item.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - bounds.width - 8, rect.left + rect.width / 2 - bounds.width / 2))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(innerHeight - bounds.height - 8, rect.top >= bounds.height + 8 ? rect.top - bounds.height - 8 : rect.bottom + 8))}px`;
  };
  const out = (event: MouseEvent) => {
    if (!(event.relatedTarget instanceof Node) || !active?.contains(event.relatedTarget)) hide();
  };
  document.addEventListener("mouseover", show);
  document.addEventListener("mouseout", out);
  document.addEventListener("focusin", show);
  document.addEventListener("focusout", hide);
  document.addEventListener("mousedown", hide);
  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, true);
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
  normalizeRecordedLayout();
  installRecordedTooltips();
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
