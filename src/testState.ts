import { readPage } from "./adapter/client";
import { isModelData, isSelections, isState } from "./adapter/protocol";
import type { ModelData, OnshapeState, Selection } from "./types";

export const MAX_STATE_BYTES = 25_000_000;
export type TestState = {
  format: "onshape-mitigator-state";
  version: 1;
  name: string;
  notes: string;
  capturedAt: string;
  path: string;
  title: string;
  viewport: { width: number; height: number };
  state: OnshapeState;
  selections: Selection[];
  model: ModelData;
  html: string;
};

// Re-applied when importing as well as exporting. No application code, network
// assets, Angular directives, form values, or extension UI belongs in a fixture.
const OMIT = "script, style, link, meta, base, iframe, frame, frameset, object, embed, template, noscript, audio, video, source, track, img, image, foreignObject, #onshape-extension-host, #mitigator-toast, #mitigator-tooltip";
const ATTR = /^(id|class|role|title|icon|tabindex|type|disabled|checked|width|height|viewBox|d|fill|stroke|stroke-width|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|points|transform|aria-[\w-]+|data-view-shown|data-testid)$/i;
// Keep layout and typography without serializing hundreds of default/custom
// properties per element. Captures freeze these values at the recorded viewport.
const STYLE_PROPERTIES = `display visibility position top right bottom left z-index
  width height min-width min-height max-width max-height box-sizing
  margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left
  border-top border-right border-bottom border-left border-radius
  color background-color opacity overflow-x overflow-y
  font-family font-size font-weight font-style line-height letter-spacing text-align white-space
  vertical-align flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self
  justify-content gap grid-template-columns grid-template-rows grid-column grid-row
  transform transform-origin float clear pointer-events`.split(/\s+/);

export function sanitizeStateDom(root: HTMLElement): void {
  root.querySelectorAll(OMIT).forEach((node) => node.remove());
  for (const node of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name === "style") {
        // CSS can load URLs even without a src attribute. Drop the entire
        // declaration if an imported capture contains resource expressions.
        if (/url\s*\(|image-set\s*\(|@|expression|https?:|\/\/|\\/i.test(attribute.value))
          node.removeAttribute("style");
      } else if (["fill", "stroke"].includes(attribute.name) && /url\s*\(|\\/i.test(attribute.value)) {
        node.removeAttribute(attribute.name);
      } else if ((attribute.name === "href" || attribute.name === "xlink:href") && /^#[\w-]+$/.test(attribute.value)) {
        // Local SVG symbols only.
      } else if (!ATTR.test(attribute.name)) node.removeAttribute(attribute.name);
    }
    if (node instanceof HTMLInputElement) {
      node.value = "";
      if (node.type === "hidden" || node.type === "password") node.remove();
    }
    if (node instanceof HTMLTextAreaElement) node.textContent = "";
    node.classList.remove("mitigator-sketch-collapsed");
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((node) => node.parentNode?.removeChild(node));
}

export function parseTestState(text: string): TestState {
  if (new TextEncoder().encode(text).length > MAX_STATE_BYTES)
    throw new Error("State exceeds the 25 MB limit.");
  const value = JSON.parse(text);
  if (!value || value.format !== "onshape-mitigator-state" || value.version !== 1 ||
    typeof value.name !== "string" || !value.name.trim() || value.name.length > 100 ||
    typeof value.notes !== "string" || value.notes.length > 4000 ||
    typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt)) ||
    typeof value.title !== "string" || typeof value.html !== "string" ||
    typeof value.path !== "string" || !/^\/documents\/[^/?#]+\/(w|v|m)\/[^/?#]+\/e\/[^/?#]+$/.test(value.path) ||
    !value.viewport || ![value.viewport.width, value.viewport.height].every(
      (n) => Number.isInteger(n) && n >= 100 && n <= 10000,
    ) || !isState(value.state) || !isSelections(value.selections) || !isModelData(value.model))
    throw new Error("Invalid or unsupported Onshape test state (expected version 1).");
  return value as TestState;
}

export async function captureTestState(name: string, notes: string): Promise<TestState> {
  const path = location.pathname;
  const [state, selections, model] = await Promise.all([
    readPage("state"), readPage("selections"), readPage("model"),
  ]);
  if (path !== location.pathname) throw new Error("Document changed during capture. Try again.");
  // Read the native expanded layout so a saved collapse preference cannot bake
  // display:none into the fixture. Restore the live DOM before yielding.
  const collapsed = Array.from(document.querySelectorAll(".mitigator-sketch-collapsed"));
  let html: string;
  try {
    collapsed.forEach((node) => node.classList.remove("mitigator-sketch-collapsed"));
    const clone = document.body.cloneNode(true) as HTMLElement;
    const originals = [document.body, ...document.body.querySelectorAll("*")];
    const copies = [clone, ...clone.querySelectorAll("*")];
    if (originals.length > 25000) throw new Error("Page is too large to capture (25,000 elements maximum).");
    originals.forEach((node, index) => {
      if (node.closest(OMIT)) return;
      const computed = getComputedStyle(node);
      const css = STYLE_PROPERTIES.flatMap((property) => {
        const value = computed.getPropertyValue(property);
        return /url\s*\(|\\/i.test(value) || property.startsWith("--") ? [] : [`${property}:${value}`];
      }).join(";");
      copies[index].setAttribute("style", css);
    });
    sanitizeStateDom(clone);
    html = clone.outerHTML;
  } finally {
    collapsed.forEach((node) => node.classList.add("mitigator-sketch-collapsed"));
  }
  return parseTestState(JSON.stringify({
    format: "onshape-mitigator-state", version: 1, name: name.trim(), notes,
    capturedAt: new Date().toISOString(), path, title: document.title,
    viewport: { width: innerWidth, height: innerHeight }, state, selections, model, html,
  }));
}

export function downloadTestState(snapshot: TestState): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${snapshot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "onshape-state"}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
