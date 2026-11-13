import { describe, expect, it } from "vitest";
import { formatContextAsMarkdown, type AiContextSnapshot } from "../../src/aiContext";

const source = {
  capturedAt: "now",
  url: "https://cad.onshape.com/documents/doc/w/workspace/e/element",
  ids: { documentId: "doc", referenceType: "w", referenceId: "workspace", elementId: "element" },
  documentTitle: "Test",
  documentName: "Test",
  elementName: "Part Studio 1",
  toolbarType: "Part Studio",
  currentTool: null,
  featureDialogOpen: false,
  selections: [],
} satisfies Pick<AiContextSnapshot, "capturedAt" | "url" | "ids" | "documentTitle" | "documentName" | "elementName" | "toolbarType" | "currentTool" | "featureDialogOpen" | "selections">;

function documentSnapshot(features: unknown): AiContextSnapshot {
  return {
    ...source,
    scope: "document",
    features: [],
    variables: [],
    model: { features, variables: null },
    viewport: {
      camera: { namedView: null, position: null, target: null, up: null, projection: null },
      canvas: null,
      visiblePanels: [],
    },
  };
}

function jsonFrom(markdown: string): unknown {
  return JSON.parse(markdown.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "null");
}

function parameter(type: string, parameterId: string, fields: object) {
  return { typeName: `BTMParameter${type}`, message: { parameterId, ...fields } };
}

function freezeTree(value: unknown): void {
  if (!value || typeof value !== "object") return;
  Object.values(value).forEach(freezeTree);
  Object.freeze(value);
}

describe("detailed context semantic JSON", () => {
  it("uses semantic roles, typed enums and expressions while preserving ID case and primitive arrays", () => {
    const snapshot = documentSnapshot({
      features: [{
        typeName: "BTMFeature",
        message: {
          featureId: "fillet-1",
          featureType: "fillet",
          parameters: [
            parameter("QueryList", "entities", { queries: [{ typeName: "BTMIndividualQuery", message: { geometryIds: ["JIl"] } }] }),
            parameter("QueryList", "booleanScope", { queries: [{ message: { geometryIds: ["JHD", "JHF", "JHD"] } }] }),
            parameter("Quantity", "radius", { expression: "2 mm", value: 0, units: "m", isInteger: false }),
            parameter("Enum", "endBound", { enumName: "BoundingType", value: "THROUGH_ALL" }),
            parameter("Boolean", "oppositeDirection", { value: false }),
            parameter("String", "label", { value: "A label" }),
          ],
          origin: [0, 0, 0],
        },
      }],
    });
    const markdown = formatContextAsMarkdown(snapshot);
    expect(jsonFrom(markdown)).toEqual({
      features: [{
        featureId: "fillet-1",
        featureType: "fillet",
        parameters: {
          entities: { QueryList: "JIl" },
          booleanScope: { QueryList: ["JHD", "JHF", "JHD"] },
          radius: "2 mm",
          endBound: { enum: "BoundingType", value: "THROUGH_ALL" },
          oppositeDirection: false,
          label: "A label",
        },
        origin: [0, 0, 0],
      }],
    });
    expect(markdown).toContain('"QueryList":["JHD","JHF","JHD"]');
    expect(markdown).toContain('"origin":[0,0,0]');
    expect(markdown).toContain("## Detailed JSON translation");
    expect(markdown).toContain("### Translated feature definitions");
    expect(markdown).not.toContain('"typeName"');
    expect(markdown).not.toContain('"message"');
  });

  it("retains structured and multiple query records and extra parameter fields", () => {
    const features = {
      parameters: [
        parameter("QueryList", "separateQueries", { queries: [
          { typeName: "BTMIndividualQuery", message: { geometryIds: ["a"] } },
          { typeName: "BTMIndividualQuery", message: { geometryIds: ["b"] } },
        ] }),
        parameter("QueryList", "region", { queries: [
          { typeName: "BTMIndividualSketchRegionQuery", message: { geometryIds: ["JGC"], filterInnerLoops: true } },
        ] }),
        parameter("Quantity", "measured", { value: 0, units: "m", isInteger: false }),
        parameter("Enum", "customEnum", { enumName: "Direction", value: "UP", custom: "keep" }),
      ],
    };
    expect(jsonFrom(formatContextAsMarkdown(documentSnapshot(features)))).toEqual({
      parameters: {
        separateQueries: { kind: "QueryList", queries: [
          { kind: "IndividualQuery", geometryIds: ["a"] },
          { kind: "IndividualQuery", geometryIds: ["b"] },
        ] },
        region: { kind: "QueryList", queries: [
          { kind: "IndividualSketchRegionQuery", geometryIds: ["JGC"], filterInnerLoops: true },
        ] },
        measured: { kind: "Quantity", value: 0, units: "m", isInteger: false },
        customEnum: { kind: "Enum", enumName: "Direction", value: "UP", custom: "keep" },
      },
    });
  });

  it("preserves duplicate or missing parameter IDs as ordered lists", () => {
    const duplicated = { parameters: [parameter("String", "same", { value: "first" }), parameter("String", "same", { value: "second" })] };
    expect(jsonFrom(formatContextAsMarkdown(documentSnapshot(duplicated)))).toEqual({
      parameters: [
        { kind: "String", parameterId: "same", value: "first" },
        { kind: "String", parameterId: "same", value: "second" },
      ],
    });
    const missing = { parameters: [parameter("String", "named", { value: "first" }), { typeName: "BTMParameterString", message: { value: "unnamed" } }] };
    expect(jsonFrom(formatContextAsMarkdown(documentSnapshot(missing)))).toEqual({
      parameters: [
        { kind: "String", parameterId: "named", value: "first" },
        { kind: "String", value: "unnamed" },
      ],
    });
  });

  it("keeps unknown kinds, ordinary messages, wrapper collisions and dangerous keys", () => {
    const features = {
      custom: { btType: "example.BTMFutureThing-987", message: { meaning: 42 } },
      ordinary: { message: { value: "ordinary message" } },
      collision: { typeName: "BTMFutureThing", name: "outer", message: { name: "inner", $type: "original", kind: "payload" } },
      parameters: [parameter("String", "__proto__", { value: "safe value" })],
      geometry: { btType: "BTMSketchCurveSegment-155", message: { entityId: "edge-1", direction: [1, 0] } },
      curveGeometry: { typeName: "BTCurveGeometryLine", message: { pntX: 0, pntY: 0, dirX: 1, dirY: 0 } },
      featureState: { typeName: "BTFeatureState", message: { featureStatus: "OK", inactive: false } },
      namedVariable: { typeName: "BTMParameterQuantity", message: { name: "height", expression: "10 mm", value: 0 } },
      flat: { parameters: [{ btType: "BTMParameterBoolean-144", parameterId: "enabled", value: false }] },
      unknownParameter: { parameters: [{ btType: "BTMParameterFuture-654", message: { parameterId: "future", value: 0, mode: "custom" } }] },
      conflictingTypes: { typeName: "BTMFeature", btType: "BTMOther", message: { name: "keep both declarations" } },
    };
    expect(jsonFrom(formatContextAsMarkdown(documentSnapshot(features)))).toEqual({
      custom: { kind: "example.BTMFutureThing-987", meaning: 42 },
      ordinary: { message: { value: "ordinary message" } },
      collision: { $type: "BTMFutureThing", $message: { name: "inner", $type: "original", kind: "payload" }, $wrapper: { name: "outer" } },
      parameters: Object.fromEntries([["__proto__", "safe value"]]),
      geometry: { kind: "SketchCurveSegment", entityId: "edge-1", direction: [1, 0] },
      curveGeometry: { kind: "CurveGeometryLine", pntX: 0, pntY: 0, dirX: 1, dirY: 0 },
      featureState: { kind: "FeatureState", featureStatus: "OK", inactive: false },
      namedVariable: { kind: "Quantity", name: "height", expression: "10 mm" },
      flat: { parameters: { enabled: false } },
      unknownParameter: { parameters: { future: { kind: "BTMParameterFuture-654", value: 0, mode: "custom" } } },
      conflictingTypes: { typeName: "BTMFeature", btType: "BTMOther", message: { name: "keep both declarations" } },
    });
  });

  it("does not mutate frozen extrusion inputs or change ordinary sketch and topology representations", () => {
    const definition = {
      typeName: "BTMFeature",
      message: { featureId: "extrude-1", featureType: "extrude", parameters: [
        parameter("Quantity", "depth", { expression: "10 mm" }),
        parameter("Boolean", "hasDraft", { value: false }),
        parameter("Quantity", "draftAngle", { expression: "3 deg" }),
      ] },
    };
    const snapshot = documentSnapshot(definition);
    freezeTree(snapshot);
    const first = formatContextAsMarkdown(snapshot);
    expect(formatContextAsMarkdown(snapshot)).toBe(first);
    expect(definition.message.parameters).toHaveLength(3);
    expect(jsonFrom(first)).toEqual({ featureId: "extrude-1", featureType: "extrude", parameters: { depth: "10 mm" } });

    const sketch: AiContextSnapshot = {
      ...source,
      scope: "sketch",
      toolbarType: "Sketch",
      sketch: { featureId: "sketch-1", name: "Sketch 1", definition: {
        typeName: "BTMSketch", message: { featureType: "newSketch", parameters: [parameter("Boolean", "disableImprinting", { value: false })], constraints: [{
          typeName: "BTMSketchConstraint", message: { constraintType: "LENGTH", parameters: [parameter("Quantity", "length", { expression: "20 mm" })] },
        }] },
      } },
    };
    freezeTree(sketch);
    const ordinary = formatContextAsMarkdown(sketch);
    const detailed = formatContextAsMarkdown(sketch, { mode: "detailed" });
    expect(jsonFrom(ordinary)).toEqual({ typeName: "BTMSketch", message: { featureType: "newSketch", constraints: [{ typeName: "BTMSketchConstraint", message: { constraintType: "LENGTH", parameters: [{ typeName: "BTMParameterQuantity", message: { parameterId: "length", expression: "20 mm" } }] } }] } });
    expect(jsonFrom(detailed)).toEqual({ featureType: "newSketch", constraints: [{ constraintType: "LENGTH", parameters: { length: "20 mm" } }] });
    expect(formatContextAsMarkdown(sketch)).toBe(ordinary);

    const topology: AiContextSnapshot = {
      ...source,
      scope: "topology",
      topology: { sourceMicroversion: null, variables: parameter("Quantity", "height", { expression: "10 mm" }), features: [], currentSelection: null, warnings: [], truncated: { featureCount: 0, entityCount: 0, characterCount: 0 } },
    };
    expect(jsonFrom(formatContextAsMarkdown(topology, { mode: "detailed" }))).toEqual(parameter("Quantity", "height", { expression: "10 mm" }));
  });
});
