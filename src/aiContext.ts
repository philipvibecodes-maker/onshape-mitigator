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

type ContextSource = {
  capturedAt: string;
  url: string;
  ids: OnshapeDocumentIds;
  documentTitle: string;
  documentName: string | null;
  elementName: string | null;
  toolbarType: OnshapeToolbarMode | null;
  currentTool: string | null;
  featureDialogOpen: boolean;
};

type DocumentContextSnapshot = ContextSource & {
  scope: "document";
  selections: ClassifiedOnshapeSelection[];
  features: string[];
  variables: string[];
  model: ModelData;
  viewport: ViewportContext;
};

type SketchContextSnapshot = ContextSource & {
  scope: "sketch";
  selections: ClassifiedOnshapeSelection[];
  sketch: {
    featureId: string | null;
    name: string | null;
    definition: unknown | null;
  };
};

export type AiContextSnapshot =
  | DocumentContextSnapshot
  | SketchContextSnapshot;

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

function omitInactiveSketchConstraintData(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const omitted = new Set<string>();
  for (const [key, child] of Object.entries(value)) {
    const offset = key.match(/^hasOffsetData(\d+)$/);
    if (offset && child === false) {
      omitted.add(key);
      omitted.add(`offsetOrientation${offset[1]}`);
      omitted.add(`offsetDistance${offset[1]}`);
    }
  }
  if (value.hasPierceParameter === false) {
    omitted.add("hasPierceParameter");
    omitted.add("pierceParameter");
  }
  if (!omitted.size) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key)),
  );
}

function compactSketchConstraintData(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const constraintType = value.typeName ?? value.btType;
  if (
    typeof constraintType !== "string" ||
    !constraintType.startsWith("BTMSketchConstraint")
  )
    return value;

  const message = value.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    return {
      ...value,
      message: omitInactiveSketchConstraintData(
        message as Record<string, unknown>,
      ),
    };
  }
  return omitInactiveSketchConstraintData(value);
}

function omitSketchFeatureParameters(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const sketchType = value.typeName ?? value.btType;
  if (
    typeof sketchType !== "string" ||
    !/^BTMSketch(?:-\d+)?$/.test(sketchType)
  )
    return value;

  const message = value.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const { parameters: _parameters, ...compactedMessage } = message as Record<
      string,
      unknown
    >;
    return { ...value, message: compactedMessage };
  }
  const { parameters: _parameters, ...compactedFeature } = value;
  return compactedFeature;
}

function omitRedundantQuantityMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const quantityType = value.typeName ?? value.btType;
  if (
    typeof quantityType !== "string" ||
    !quantityType.startsWith("BTMParameterQuantity")
  )
    return value;

  const compactQuantity = (
    quantity: Record<string, unknown>,
  ): Record<string, unknown> => {
    if (
      typeof quantity.expression !== "string" ||
      !quantity.expression.trim()
    )
      return quantity;
    const {
      units: _units,
      value: _value,
      isInteger: _isInteger,
      ...compacted
    } = quantity;
    return compacted;
  };

  const message = value.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    return {
      ...value,
      message: compactQuantity(message as Record<string, unknown>),
    };
  }
  return compactQuantity(value);
}

function isEmptyCompactedValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

function compactModelDefinition(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(compactModelDefinition)
      .filter((child) => child !== undefined);
  if (!value || typeof value !== "object") return value;

  const source = compactSketchConstraintData(
    omitRedundantQuantityMetadata(
      omitSketchFeatureParameters(value as Record<string, unknown>),
    ),
  );
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
        if (
          key === "type" &&
          typeof child === "number" &&
          typeof source.typeName === "string"
        )
          return false;
        if (child === undefined || child === null) return false;
        if (isEmptyCompactedValue(child)) return false;
        return true;
      })
      .map(([key, child]) => [key, compactModelDefinition(child)])
      .filter(
        ([, child]) => child !== undefined && !isEmptyCompactedValue(child),
      ),
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

type SketchIdentity = { featureId: string; name: string | null };

function getActiveSketchIdentity(): SketchIdentity | null {
  const dialog = document.querySelector<HTMLElement>(
    '#feature-dialog[feature-type="newSketch"]',
  );
  if (!dialog) return null;

  const row = document.querySelector<HTMLElement>(
    '#feature-list .edited[feature-id][feature-type="newSketch"]',
  );
  const featureId = row?.getAttribute("feature-id")?.trim();
  if (!row || !featureId) return null;

  const rowName =
    row.querySelector<HTMLElement>(
      '[class*="label"], [class*="name"], [data-testid*="name"]',
    )?.textContent?.trim() ?? row.textContent?.trim();
  const dialogName = dialog
    .querySelector<HTMLElement>(
      '.feature-dialog-title, .ns-dialog-title, [class*="dialog-title"]',
    )
    ?.textContent?.trim();

  return { featureId, name: rowName || dialogName || null };
}

function unwrapFeature(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const message = record.message;
  return message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>)
    : record;
}

function isSketchFeature(
  original: Record<string, unknown>,
  feature: Record<string, unknown>,
): boolean {
  if (feature.featureType === "newSketch") return true;
  if (original.typeName === "BTMSketch" || feature.typeName === "BTMSketch")
    return true;
  const btType = feature.btType ?? original.btType;
  return typeof btType === "string" && btType.startsWith("BTMSketch");
}

export function findSketchDefinition(
  featuresResponse: unknown,
  featureId: string,
): unknown | null {
  if (
    !featuresResponse ||
    typeof featuresResponse !== "object" ||
    Array.isArray(featuresResponse) ||
    !Array.isArray((featuresResponse as { features?: unknown }).features)
  )
    return null;

  const matches = (featuresResponse as { features: unknown[] }).features.filter(
    (entry) => unwrapFeature(entry)?.featureId === featureId,
  );
  if (matches.length !== 1) return null;

  const original = matches[0];
  const feature = unwrapFeature(original);
  if (!feature || !original || typeof original !== "object") return null;
  return isSketchFeature(original as Record<string, unknown>, feature)
    ? original
    : null;
}

export async function collectAiContext(opts?: {
  toolbarType?: OnshapeToolbarMode | null;
  currentTool?: string | null;
}): Promise<AiContextSnapshot> {
  const sketchDialogOpen = Boolean(
    document.querySelector('#feature-dialog[feature-type="newSketch"]'),
  );
  const sketchIdentity = getActiveSketchIdentity();
  const scope =
    opts?.toolbarType === "Sketch" || sketchDialogOpen ? "sketch" : "document";
  const source: ContextSource = {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    ids: parseOnshapeUrl(window.location.href),
    documentTitle: document.title,
    documentName: getDocumentName(),
    elementName: getActiveElementName(),
    toolbarType: opts?.toolbarType ?? null,
    currentTool: opts?.currentTool ?? null,
    featureDialogOpen: Boolean(document.querySelector("#feature-dialog")),
  };
  const [selections, model] = await Promise.all([
    getCurrentSelections().catch(() => []),
    readPage("model").catch(() => ({ features: null, variables: null })),
  ]);

  if (scope === "sketch") {
    return {
      ...source,
      scope,
      selections: selections.filter(
        ({ kind }) => kind === "sketch" || kind === "sketch-entity",
      ),
      sketch: {
        featureId: sketchIdentity?.featureId ?? null,
        name: sketchIdentity?.name ?? null,
        definition: sketchIdentity
          ? findSketchDefinition(model.features, sketchIdentity.featureId)
          : null,
      },
    };
  }

  return {
    ...source,
    scope,
    selections,
    features: collectFeatureList(),
    variables: collectVariables(),
    model,
    viewport: collectViewportContext(),
  };
}

function formatSource(
  snapshot: AiContextSnapshot,
  heading: "Document" | "Source",
): string[] {
  const lines = [
    `## ${heading}`,
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
  return lines;
}

function formatSketchContext(snapshot: SketchContextSnapshot): string {
  const sketchSelections = snapshot.selections.filter(
    ({ kind }) => kind === "sketch" || kind === "sketch-entity",
  );
  const lines = [
    "# Onshape Sketch Context",
    "",
    `Captured: ${snapshot.capturedAt}`,
    "",
    ...formatSource(snapshot, "Source"),
    "",
    "## Current sketch",
    `- Workspace mode: ${snapshot.toolbarType ?? "unknown"}`,
    `- Active tool: ${snapshot.currentTool ?? "none"}`,
    `- Feature dialog open: ${snapshot.featureDialogOpen ? "yes" : "no"}`,
    `- Feature ID: ${snapshot.sketch.featureId ?? "unavailable"}`,
    `- Sketch name: ${snapshot.sketch.name ?? "unavailable"}`,
  ];

  lines.push("", "## Current sketch selection");
  if (sketchSelections.length) {
    for (const selection of sketchSelections) {
      const detail = [
        selection.kind,
        "name" in selection ? selection.name : null,
        selection.id,
      ]
        .filter(Boolean)
        .join(" — ");
      lines.push(`- ${detail}`);
    }
  } else {
    lines.push("- (none reported; selection data may be unavailable)");
  }

  lines.push(
    "",
    "## Native data compaction",
    "The native sketch definition below is intentionally shortened. The following data is removed:",
    "- Numeric `type` when the readable `typeName` is present.",
    "- The sketch feature's root `parameters` field.",
    "- Metadata fields: `nodeId`, `hasUserCode`, `namespace`, `libraryRelationType`, `parameterName`, `index`, `filter`, and `helpParameters`.",
    "- Empty or unavailable values: `null`, `undefined`, empty strings, empty arrays, empty objects, and query-list parameters with no queries.",
    "- Quantity metadata `units`, normalized `value`, and `isInteger` when a nonempty `expression` is present.",
    "- Annotation-only sketch parameters: `labelRatio`, `labelAngle`, and `labelDistance`.",
    "- Inactive constraint offset groups: `hasOffsetDataN`, `offsetOrientationN`, and `offsetDistanceN` when `hasOffsetDataN` is false.",
    "- Inactive pierce data: `hasPierceParameter` and `pierceParameter` when `hasPierceParameter` is false.",
  );

  lines.push("", "## Native sketch definition");
  if (snapshot.sketch.definition !== null) {
    lines.push("```json");
    lines.push(
      JSON.stringify(compactModelDefinition(snapshot.sketch.definition), null, 2),
    );
    lines.push("```");
  } else {
    lines.push("- Active sketch definition unavailable.");
  }
  lines.push(
    "",
    "---",
    "The above is context about my current Onshape sketch. I will follow up with my specific question — please wait for it.",
  );
  return lines.join("\n");
}

function formatDocumentContext(snapshot: DocumentContextSnapshot): string {
  const lines: string[] = [
    "# Onshape Context",
    "",
    `Captured: ${snapshot.capturedAt}`,
    "",
    ...formatSource(snapshot, "Document"),
  ];

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

export function formatContextAsMarkdown(snapshot: AiContextSnapshot): string {
  return snapshot.scope === "sketch"
    ? formatSketchContext(snapshot)
    : formatDocumentContext(snapshot);
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
