import { getStorageItem } from "./storage";
import { readPage } from "./adapter/client";
import type {
  OnshapeToolbarMode,
  Selection as ClassifiedOnshapeSelection,
  ModelData,
} from "./types";

export type OnshapeDocumentIds = {
  documentId: string | null;
  referenceType: "w" | "v" | "m" | null;
  referenceId: string | null;
  elementId: string | null;
};

export type ViewportContext = {
  camera: {
    namedView: string | null;
    position: number[] | null;
    target: number[] | null;
    up: number[] | null;
    projection: string | null;
  };
  canvas: { x: number; y: number; width: number; height: number } | null;
  visiblePanels: Array<{ label: string; x: number; y: number; width: number; height: number }>;
};

export type AiContextSnapshot = {
  capturedAt: string;
  url: string;
  ids: OnshapeDocumentIds;
  documentTitle: string;
  documentName: string | null;
  elementName: string | null;
  toolbarType: OnshapeToolbarMode | null;
  currentTool: string | null;
  featureDialogOpen: boolean;
  selections: ClassifiedOnshapeSelection[];
  features: string[];
  variables: string[];
  model: ModelData;
  viewport: ViewportContext;
};

export function parseOnshapeUrl(href: string): OnshapeDocumentIds {
  const url = new URL(href);

  const pathMatch = url.pathname.match(
    /\/documents\/([^/]+)\/(w|v|m)\/([^/]+)\/e\/([^/?#]+)/,
  );
  if (pathMatch) {
    return {
      documentId: pathMatch[1],
      referenceType: pathMatch[2] as "w" | "v" | "m",
      referenceId: pathMatch[3],
      elementId: pathMatch[4],
    };
  }

  return {
    documentId:
      url.searchParams.get("documentId") ?? url.searchParams.get("did"),
    referenceType: url.searchParams.has("wvmId")
      ? (url.searchParams.get("wvm") as "w" | "v" | "m" | null)
      : null,
    referenceId: url.searchParams.get("wvmId"),
    elementId: url.searchParams.get("elementId") ?? url.searchParams.get("eid"),
  };
}

function textOfFirst(selectors: string[]): string | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      // ignore invalid selector and move on
    }
  }
  return null;
}

function getDocumentName(): string | null {
  const fromDom = textOfFirst([
    '[data-testid="document-title"]',
    ".document-title",
    ".navbar-document-name",
    "#document-title",
  ]);
  if (fromDom) return fromDom;

  const title = document.title.replace(/\s*[-|–]\s*Onshape.*$/i, "").trim();
  return title || null;
}

function getActiveElementName(): string | null {
  return textOfFirst([
    ".os-element-tab.active",
    '[class*="element-tab"][class*="active"]',
    ".element-tabs .active",
    ".os-tab-bar .active",
  ]);
}

export function getCurrentSelections(
  timeoutMs = 1500,
): Promise<ClassifiedOnshapeSelection[]> {
  return readPage("selections", timeoutMs);
}

function collectViewportContext(): ViewportContext {
  const rect = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  };
  const isVisible = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      bounds.right > 0 &&
      bounds.bottom > 0 &&
      bounds.left < window.innerWidth &&
      bounds.top < window.innerHeight
    );
  };

  const canvas = document.querySelector("#canvas, #viewerdiv canvas");
  const canvasBounds = canvas && isVisible(canvas) ? rect(canvas) : null;
  const namedView = canvas?.getAttribute("data-view-shown") ?? null;
  const panelSelectors = [
    ["Feature tree", "#feature-list, [class*='feature-list']"],
    ["Right panel", "#right-panel, [class*='right-pane']"],
    ["Feature dialog", "#feature-dialog"],
    ["Variables table", "[class*='variable-table']"],
  ] as const;
  const visiblePanels = panelSelectors.flatMap(([label, selector]) => {
    const element = document.querySelector(selector);
    return element && isVisible(element) ? [{ label, ...rect(element) }] : [];
  });

  return {
    camera: {
      namedView,
      position: null,
      target: null,
      up: null,
      projection: null,
    },
    canvas: canvasBounds,
    visiblePanels,
  };
}

const MODEL_METADATA_KEYS = new Set([
  "nodeId",
  "hasUserCode",
  "namespace",
  "libraryRelationType",
  "parameterName",
  "index",
  "filter",
  "helpParameters",
]);

const SKETCH_ANNOTATION_PARAMETER_IDS = new Set([
  "labelRatio",
  "labelAngle",
  "labelDistance",
]);

const EXTRUDE_BASE_PARAMETER_IDS = new Set([
  "domain",
  "bodyType",
  "operationType",
  "entities",
  "endBound",
  "depth",
  "endBoundEntityFace",
  "endBoundEntityBody",
  "endBoundEntityVertex",
]);

function parameterId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: { parameterId?: unknown } }).message;
  return typeof message?.parameterId === "string" ? message.parameterId : null;
}

function compactFeatureParameters(value: Record<string, unknown>): unknown {
  const message = value.message;
  if (!message || typeof message !== "object") return value;
  const feature = message as Record<string, unknown>;
  if (!Array.isArray(feature.parameters)) return value;

  const featureType = feature.featureType;
  const parameters = feature.parameters as unknown[];
  if (featureType === "extrude") {
    const enabled = new Set(EXTRUDE_BASE_PARAMETER_IDS);
    const flags = new Set(
      parameters
        .filter((item) => {
          if (!item || typeof item !== "object") return false;
          const p = item as { typeName?: unknown; message?: { value?: unknown } };
          return p.typeName === "BTMParameterBoolean" && p.message?.value === true;
        })
        .map(parameterId)
        .filter((id): id is string => id !== null),
    );
    const optionalGroups: Record<string, string[]> = {
      hasOffset: ["hasOffset", "offsetDistance", "offsetOppositeDirection"],
      hasExtrudeDirection: ["hasExtrudeDirection", "extrudeDirection"],
      startOffset: ["startOffset", "startOffsetBound", "startOffsetDistance", "startOffsetOppositeDirection", "startOffsetEntity"],
      hasDraft: ["hasDraft", "draftAngle", "draftPullDirection"],
      hasSecondDirection: ["hasSecondDirection", "secondDirectionBound", "secondDirectionOppositeDirection", "secondDirectionDepth", "secondDirectionBoundEntityFace", "secondDirectionBoundEntityBody", "secondDirectionBoundEntityVertex"],
      hasSecondDirectionOffset: ["hasSecondDirectionOffset", "secondDirectionOffsetDistance", "secondDirectionOffsetOppositeDirection"],
      hasSecondDirectionDraft: ["hasSecondDirectionDraft", "secondDirectionDraftAngle", "secondDirectionDraftPullDirection"],
    };
    for (const [flag, ids] of Object.entries(optionalGroups))
      if (flags.has(flag)) ids.forEach((id) => enabled.add(id));
    if (flags.has("midplane")) enabled.add("midplane");
    if (flags.has("oppositeDirection")) enabled.add("oppositeDirection");
    if (flags.has("symmetric")) enabled.add("symmetric");
    const thin = parameters.some((item) => {
      const id = parameterId(item);
      const p = item as { message?: { value?: unknown } };
      return id === "bodyType" && p.message?.value === "THIN";
    });
    if (thin)
      ["thickness", "thickness1", "thickness2", "surfaceEntities", "wallShape"].forEach((id) => enabled.add(id));

    feature.parameters = parameters.filter((item) => {
      const id = parameterId(item);
      if (!id) return false;
      if (enabled.has(id)) return true;
      if (item && typeof item === "object") {
        const msg = (item as { message?: { queries?: unknown[] } }).message;
        if (Array.isArray(msg?.queries) && msg.queries.length > 0) return true;
      }
      return false;
    });
  }

  return value;
}

function compactModelDefinition(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(compactModelDefinition)
      .filter((child) => child !== undefined);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  if (
    source.typeName === "BTMParameterQuantity" &&
    SKETCH_ANNOTATION_PARAMETER_IDS.has(parameterId(source) ?? "")
  )
    return undefined;
  if (source.typeName === "BTMFeature") compactFeatureParameters(source);
  if (source.typeName === "BTMParameterQueryList") {
    const msg = source.message as { queries?: unknown[] } | undefined;
    if (Array.isArray(msg?.queries) && msg.queries.length === 0) return undefined;
  }

  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, child]) => {
        if (MODEL_METADATA_KEYS.has(key)) return false;
        if (child === undefined || child === null) return false;
        if (key === "parameters" && Array.isArray(child)) {
          return child.length > 0;
        }
        return true;
      })
      .map(([key, child]) => [key, compactModelDefinition(child)])
      .filter(([, child]) => child !== undefined),
  );
}

function collectFeatureList(): string[] {
  const selectors = [
    "#feature-list .feature-list-item",
    ".os-feature-list-item",
    '[class*="featurelist"] [class*="feature-item"]',
    '[ng-repeat*="feature"]',
  ];

  for (const selector of selectors) {
    try {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(selector));
      const names = rows
        .map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean);
      if (names.length) return names;
    } catch {
      // try next selector
    }
  }

  return [];
}

function collectVariables(): string[] {
  const selectors = [
    ".variable-table tr",
    '[class*="variable-table"] [role="row"]',
    '[class*="variableTable"] tr',
  ];

  for (const selector of selectors) {
    try {
      const rows = Array.from(document.querySelectorAll<HTMLElement>(selector));
      const values = rows
        .map((row) => {
          const cells = Array.from(
            row.querySelectorAll("td,th,[role=cell],[role=columnheader]"),
          );
          const text = cells.length
            ? cells.map((cell) => cell.textContent?.trim() ?? "").join(" ")
            : (row.textContent ?? "");
          return text.replace(/\s+/g, " ").trim();
        })
        .filter(Boolean);
      if (values.length) return values;
    } catch {
      // try next selector
    }
  }

  return [];
}

export async function collectAiContext(opts?: {
  toolbarType?: OnshapeToolbarMode | null;
  currentTool?: string | null;
}): Promise<AiContextSnapshot> {
  const [selections, model] = await Promise.all([
    getCurrentSelections().catch(() => []),
    readPage("model").catch(() => ({ features: null, variables: null })),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    ids: parseOnshapeUrl(window.location.href),
    documentTitle: document.title,
    documentName: getDocumentName(),
    elementName: getActiveElementName(),
    toolbarType: opts?.toolbarType ?? null,
    currentTool: opts?.currentTool ?? null,
    featureDialogOpen: Boolean(document.querySelector("#feature-dialog")),
    selections,
    features: collectFeatureList(),
    variables: collectVariables(),
    model,
    viewport: collectViewportContext(),
  };
}

export function formatContextAsMarkdown(snapshot: AiContextSnapshot): string {
  const lines: string[] = [
    "# Onshape Context",
    "",
    `Captured: ${snapshot.capturedAt}`,
    "",
    "## Document",
    `- URL: ${snapshot.url}`,
    `- Title: ${snapshot.documentTitle}`,
  ];

  if (snapshot.documentName) lines.push(`- Document: ${snapshot.documentName}`);
  if (snapshot.elementName)
    lines.push(`- Active element: ${snapshot.elementName}`);
  if (snapshot.ids.documentId)
    lines.push(`- Document ID: ${snapshot.ids.documentId}`);
  if (snapshot.ids.referenceId)
    lines.push(
      `- ${snapshot.ids.referenceType === "w" ? "Workspace" : snapshot.ids.referenceType === "v" ? "Version" : "Microversion"} ID: ${snapshot.ids.referenceId}`,
    );
  if (snapshot.ids.elementId)
    lines.push(`- Element ID: ${snapshot.ids.elementId}`);

  lines.push("", "## State");
  lines.push(`- Workspace mode: ${snapshot.toolbarType ?? "unknown"}`);
  lines.push(`- Active tool: ${snapshot.currentTool ?? "none"}`);
  lines.push(
    `- Feature dialog open: ${snapshot.featureDialogOpen ? "yes" : "no"}`,
  );

  lines.push("", "## Current selection");
  if (snapshot.selections.length) {
    for (const s of snapshot.selections) {
      const detail = [s.kind, "name" in s ? s.name : null, s.id]
        .filter(Boolean)
        .join(" — ");
      lines.push(`- ${detail}`);
    }
  } else {
    lines.push("- (none reported; selection data may be unavailable)");
  }

  lines.push("", "## Viewport");
  lines.push(`- View orientation/preset: ${snapshot.viewport.camera.namedView ?? "unknown"}`);
  if (snapshot.viewport.camera.position) {
    lines.push(`- Camera position: ${snapshot.viewport.camera.position.join(", ")}`);
    lines.push(`- Camera target: ${snapshot.viewport.camera.target?.join(", ") ?? "unknown"}`);
    lines.push(`- Camera up: ${snapshot.viewport.camera.up?.join(", ") ?? "unknown"}`);
  } else {
    lines.push("- Camera coordinates and projection: unavailable from Onshape's exposed page state");
  }
  if (snapshot.viewport.canvas) {
    const { x, y, width, height } = snapshot.viewport.canvas;
    lines.push(`- Visible modeling canvas: ${width} × ${height} CSS px at (${x}, ${y})`);
  } else {
    lines.push("- Visible modeling canvas: unavailable");
  }
  if (snapshot.viewport.visiblePanels.length) {
    lines.push("- Visible panels:");
    for (const panel of snapshot.viewport.visiblePanels)
      lines.push(`  - ${panel.label}: ${panel.width} × ${panel.height} CSS px at (${panel.x}, ${panel.y})`);
  } else {
    lines.push("- Visible panels: none detected");
  }

  if (snapshot.variables.length) {
    lines.push("", "## Variables");
    for (const v of snapshot.variables) lines.push(`- ${v}`);
  }

  if (snapshot.features.length) {
    lines.push("", "## Feature list");
    for (const f of snapshot.features) lines.push(`- ${f}`);
  }

  lines.push("", "## Reconstruction data");
  lines.push(
    "The following is the document's native Part Studio definition data. It contains the feature history, feature parameters, sketch geometry/constraints, references, and variables needed to reproduce the model.",
  );
  if (snapshot.model.features !== null) {
    lines.push("", "### Native feature definitions", "```json");
    lines.push(
      JSON.stringify(compactModelDefinition(snapshot.model.features), null, 2),
    );
    lines.push("```");
  } else {
    lines.push("- Native feature definitions unavailable in this document state.");
  }
  if (snapshot.model.variables !== null) {
    lines.push("", "### Native variable definitions", "```json");
    lines.push(
      JSON.stringify(compactModelDefinition(snapshot.model.variables), null, 2),
    );
    lines.push("```");
  } else {
    lines.push("- Native variable definitions unavailable in this document state.");
  }

  lines.push(
    "",
    "---",
    "The above is context about my current Onshape document. I will follow up with my specific question — please wait for it.",
  );

  return lines.join("\n");
}

export function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "8px 16px",
    background: "rgba(18, 21, 29, 0.95)",
    color: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #2b3445",
    fontSize: "13px",
    zIndex: "999999",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 150ms ease",
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });
  window.setTimeout(() => {
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 200);
  }, 2200);
}

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const CONTEXT_URL_MAX_LENGTH = 6000;

export function buildChatbotUrl(template: string, context: string): string {
  if (!template.includes("{context}")) return template;

  const separatorIndex = template.indexOf("{context}");
  const prefix = template.slice(0, separatorIndex);
  const suffix = template.slice(separatorIndex + "{context}".length);
  const budget = Math.max(
    0,
    CONTEXT_URL_MAX_LENGTH - prefix.length - suffix.length,
  );

  let encoded = encodeURIComponent(context.toWellFormed());
  while (encoded.length > budget && context.length > 0) {
    context = context.slice(0, Math.floor(context.length * 0.8));
    encoded = encodeURIComponent(context.toWellFormed());
  }

  return `${prefix}${encoded}${suffix}`;
}

export async function copyAiContextToClipboard(opts?: {
  toolbarType?: OnshapeToolbarMode | null;
  currentTool?: string | null;
}): Promise<boolean> {
  const [snapshot, chatbotUrl, openAfterCopy] = await Promise.all([
    collectAiContext(opts),
    getStorageItem("aiChatbotUrl"),
    getStorageItem("aiOpenAfterCopy"),
  ]);

  const markdown = formatContextAsMarkdown(snapshot);
  const ok = await writeClipboard(markdown);
  showToast(ok ? "Context copied for AI" : "Could not copy context");

  if (ok && openAfterCopy && chatbotUrl) {
    try {
      const url = new URL(buildChatbotUrl(chatbotUrl, markdown));
      if (url.protocol === "https:" || url.protocol === "http:")
        window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Context copied; chatbot URL is invalid");
    }
  }

  return ok;
}
