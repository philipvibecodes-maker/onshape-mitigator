import { describe, expect, it } from "vitest";
import { formatContextAsMarkdown, type AiContextSnapshot } from "../../src/aiContext";
import type { TopologyFeatureEvaluation, TopologyGraph } from "../../src/types";

function parameter(type: string, parameterId: string, fields: object) {
  return { typeName: `BTMParameter${type}`, message: { parameterId, ...fields } };
}

function query(parameterId: string, ids: string[], extra = {}) {
  return parameter("QueryList", parameterId, {
    queries: [{ typeName: "BTMIndividualQuery", message: { geometryIds: ids } }],
    ...extra,
  });
}

const graph: TopologyGraph = {
  rollbackBarIndex: 0,
  entities: [{ id: "face", kind: "FACE", area: 0, edges: [], surfaceDefinition: {
    typeName: "evaluator-type", message: { origin: [0, 0, 0], samples: [] },
  } }],
  unresolved: [],
};

function snapshot(parameters: unknown[], inputRoles: Record<string, string[]> = {}): AiContextSnapshot {
  const evaluation: TopologyFeatureEvaluation = {
    index: 0, featureId: "feature", name: "Feature", featureType: "fillet", status: "OK", suppressed: false,
    definition: { typeName: "BTMFeature", message: { parameters } },
    inputRoles, affectedInputs: graph,
    resultingNeighborhood: { rollbackBarIndex: 1, entities: [], unresolved: [] },
    createdByFeature: { faces: [], edges: [], unresolved: [] },
    unmatchedTopology: { postOnlyEntityCount: 0, preOnlyEntityCount: 0, retainedButChangedCount: 0 },
    warnings: ["feature warning"],
  };
  return {
    scope: "topology", capturedAt: "now", url: "https://cad.onshape.com/documents/doc/w/work/e/element",
    ids: { documentId: "doc", referenceType: "w", referenceId: "work", elementId: "element" },
    documentTitle: "Test", documentName: "Test", elementName: "Part Studio", toolbarType: "Part Studio",
    currentTool: null, featureDialogOpen: false, selections: [],
    topology: {
      sourceMicroversion: "version", variables: { variables: [parameter("Quantity", "height", { expression: "10 mm", value: 0, units: "m" })] },
      features: [evaluation], currentSelection: graph, warnings: ["collection warning"],
      truncated: { featureCount: 0, entityCount: 0, characterCount: 0 },
    },
  };
}

function blocks(value: AiContextSnapshot) {
  return Array.from(formatContextAsMarkdown(value).matchAll(/```json\n([\s\S]*?)\n```/g), (match) => JSON.parse(match[1]));
}

describe("compact topology context", () => {
  it("translates native leaves and preserves evaluated graphs, selection and collection details", () => {
    const value = snapshot([
      query("entities", ["A", "b"]),
      parameter("Quantity", "radius", { expression: "2 mm", value: 0, units: "m" }),
      parameter("Boolean", "enabled", { value: false }),
      parameter("Enum", "direction", { enumName: "Direction", value: "UP" }),
    ], { entities: ["A", "b"] });
    const original = structuredClone(value);
    const [variables, rows, selection] = blocks(value);
    expect(variables).toEqual({ variables: [{ kind: "Quantity", parameterId: "height", expression: "10 mm" }] });
    if (value.scope !== "topology") throw new Error("Expected topology snapshot");
    const { definition: _definition, featureId: _featureId, name: _name, featureType: _featureType, suppressed: _suppressed, ...evaluation } = value.topology.features[0];
    expect(rows).toEqual([{ ...evaluation, feature: {
      featureId: "feature", name: "Feature", featureType: "fillet", suppressed: false,
      parameters: { radius: "2 mm", enabled: false, direction: { enum: "Direction", value: "UP" } },
    } }]);
    expect(selection).toEqual(graph);
    expect(JSON.stringify(variables)).not.toContain("message");
    expect(JSON.stringify(rows[0].feature)).not.toContain("typeName");
    expect(formatContextAsMarkdown(value)).toContain("collection warning");
    expect(formatContextAsMarkdown(value)).toContain("- Native feature parameters and variables use semantic JSON: safe BTM transport wrappers are removed, while ambiguous or unknown forms retain type identity.");
    expect(value).toEqual(original);
  });

  it("omits parameters when the only query is exactly represented by input roles", () => {
    const [, rows] = blocks(snapshot([query("entities", ["A"])], { entities: ["A"] }));
    expect(rows[0].feature).toEqual({
      featureId: "feature", name: "Feature", featureType: "fillet", suppressed: false,
    });
    expect(rows[0].inputRoles).toEqual({ entities: ["A"] });
  });

  it("removes only unique simple query IDs with the same ordered role IDs", () => {
    const [, rows] = blocks(snapshot([
      query("single", ["A"]), query("missing", ["A"]), query("case", ["a"]),
      query("length", ["A", "b"]),
      query("order", ["b", "A"]), query("duplicates", ["A", "A"]),
      query("extra", ["A"], { custom: true }),
      parameter("QueryList", "structured", { queries: [{ typeName: "BTMIndividualSketchRegionQuery", message: { geometryIds: ["A"], filterInnerLoops: true } }] }),
      parameter("QueryList", "queryExtra", { queries: [{ typeName: "BTMIndividualQuery", message: { geometryIds: ["A"], custom: true } }] }),
      parameter("QueryList", "multiple", { queries: [{ message: { geometryIds: ["A"] } }, { message: { geometryIds: ["b"] } }] }),
    ], { single: ["A"], case: ["A"], length: ["A"], order: ["A", "b"], duplicates: ["A", "A"], extra: ["A"], structured: ["A"], queryExtra: ["A"], multiple: ["A", "b"] }));
    expect(rows[0].feature.parameters).toEqual({
      missing: { QueryList: "A" }, case: { QueryList: "a" }, order: { QueryList: ["b", "A"] }, duplicates: { QueryList: ["A", "A"] },
      length: { QueryList: ["A", "b"] },
      extra: { kind: "QueryList", queries: [{ kind: "IndividualQuery", geometryIds: ["A"] }], custom: true },
      structured: { kind: "QueryList", queries: [{ kind: "IndividualSketchRegionQuery", geometryIds: ["A"], filterInnerLoops: true }] },
      queryExtra: { kind: "QueryList", queries: [{ kind: "IndividualQuery", geometryIds: ["A"], custom: true }] },
      multiple: { kind: "QueryList", queries: [{ message: { geometryIds: ["A"] } }, { message: { geometryIds: ["b"] } }] },
    });
  });

  it("retains unknown semantic types and collision forms", () => {
    const [, rows] = blocks(snapshot([
      parameter("Future", "future", { value: 0, custom: false }),
      { typeName: "BTMParameterQueryList", custom: "outer", message: { parameterId: "collision", custom: "inner", queries: [{ message: { geometryIds: ["A"] } }] } },
      parameter("Future", "kindCollision", { kind: "original", value: 0 }),
    ], { collision: ["A"] }));
    expect(rows[0].feature.parameters).toEqual({
      future: { kind: "BTMParameterFuture", value: 0, custom: false },
      collision: { $type: "BTMParameterQueryList", $message: { custom: "inner", queries: [{ message: { geometryIds: ["A"] } }] }, $wrapper: { custom: "outer" } },
      kindCollision: { $type: "BTMParameterFuture", $message: { kind: "original", value: 0 }, $wrapper: {} },
    });
  });

  it.each([
    [query("entities", ["A"]), query("entities", ["b"])],
    [query("entities", ["A"]), { typeName: "BTMParameterString", message: { value: "unnamed" } }],
  ])("preserves fallback parameter arrays without query pruning", (...parameters) => {
    const [, rows] = blocks(snapshot(parameters, { entities: ["A"] }));
    expect(rows[0].feature.parameters).toHaveLength(2);
    expect(rows[0].feature.parameters[0]).toEqual({ kind: "QueryList", parameterId: "entities", queries: [{ kind: "IndividualQuery", geometryIds: ["A"] }] });
  });
});
