import type {
  TopologyEntity,
  TopologyFeatureEvaluation,
  TopologyGraph,
  TopologyModelData,
} from "../types";

const MAX_RESPONSE_CHARS = 2_000_000;
const MAX_FEATURES = 100;
const MAX_ENTITIES = 300;
const MAX_SERIALIZED_CHARS = 750_000;
const COLLECTION_TIMEOUT_MS = 30_000;

type RecordValue = Record<string, unknown>;
type EvaluationState = {
  selected: TopologyEntity[];
  faces: TopologyEntity[];
  edges: TopologyEntity[];
  createdFaces: string[];
  createdEdges: string[];
  sourceMicroversion: string | null;
  warnings: string[];
};

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function unwrapFeature(value: unknown): RecordValue | null {
  const outer = record(value);
  if (!outer) return null;
  return record(outer.message) ?? outer;
}

function decodeFsValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeFsValue);
  const node = value as RecordValue;
  const btType = typeof node.btType === "string" ? node.btType : "";
  if (btType.includes("BTFSValueMapEntry"))
    return [decodeFsValue(node.key), decodeFsValue(node.value)];
  if (btType.includes("BTFSValueMap")) {
    const result: RecordValue = {};
    for (const entry of Array.isArray(node.value) ? node.value : []) {
      const decoded = decodeFsValue(entry);
      if (
        Array.isArray(decoded) &&
        decoded.length === 2 &&
        typeof decoded[0] === "string"
      )
        result[decoded[0]] = decoded[1];
    }
    return result;
  }
  if (btType.includes("BTFSValueArray"))
    return (Array.isArray(node.value) ? node.value : []).map(decodeFsValue);
  if (btType.includes("BTFSValue")) return decodeFsValue(node.value);
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, decodeFsValue(child)]),
  );
}

function queryId(value: unknown): string | null {
  const item = record(value);
  return typeof item?.transientId === "string" ? item.transientId : null;
}

function queryIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(queryId).filter((id): id is string => id !== null)
    : [];
}

function normalizeEntity(value: unknown): TopologyEntity | null {
  const item = record(value);
  if (!item || typeof item.id !== "string" || typeof item.kind !== "string")
    return null;
  const kind = ["FACE", "EDGE", "BODY", "VERTEX", "UNKNOWN"].includes(
    item.kind,
  )
    ? (item.kind as TopologyEntity["kind"])
    : "UNKNOWN";
  const entity: TopologyEntity = { id: item.id, kind };
  if (item.surface !== undefined) entity.surfaceDefinition = item.surface;
  if (item.curve !== undefined) entity.curveDefinition = item.curve;
  if (typeof item.area === "number") entity.area = item.area;
  if (typeof item.length === "number") entity.length = item.length;
  if (Array.isArray(item.point) && item.point.every((v) => typeof v === "number"))
    entity.point = item.point as number[];
  const edges = queryIds(item.edges);
  const faces = queryIds(item.faces);
  if (kind === "BODY") {
    entity.edgeCount = edges.length;
    entity.faceCount = faces.length;
  } else {
    if (edges.length) entity.edges = edges;
    if (faces.length) entity.faces = faces;
  }
  return entity;
}

function normalizeEntities(value: unknown): TopologyEntity[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, TopologyEntity>();
  for (const child of value) {
    const entity = normalizeEntity(child);
    if (entity) byId.set(entity.id, entity);
  }
  return [...byId.values()];
}

function fsString(value: string): string {
  return JSON.stringify(value);
}

function buildEvaluationScript(
  selectedIds: string[],
  createdByFeatureId: string | null,
): string {
  const ids = JSON.stringify([...new Set(selectedIds)]);
  const createdId = createdByFeatureId
    ? fsString(createdByFeatureId)
    : null;
  return `function(context is Context, queries)
  {
      var selected = [];
      for (var transientId in ${ids})
      {
          var entity = qTransient(transientId);
          if (size(evaluateQuery(context, qEntityFilter(entity, EntityType.FACE))) > 0)
          {
              var boundaryEdges = evaluateQuery(context, qAdjacent(entity, AdjacencyType.EDGE, EntityType.EDGE));
              selected = append(selected, { "id" : transientId, "kind" : "FACE", "surface" : evSurfaceDefinition(context, { "face" : entity }), "area" : evArea(context, { "entities" : entity }), "edges" : boundaryEdges });
              for (var boundaryEdge in boundaryEdges)
                  selected = append(selected, { "id" : boundaryEdge.transientId, "kind" : "EDGE", "curve" : evCurveDefinition(context, { "edge" : boundaryEdge }), "length" : evLength(context, { "entities" : boundaryEdge }), "faces" : evaluateQuery(context, qAdjacent(boundaryEdge, AdjacencyType.EDGE, EntityType.FACE)) });
          }
          else if (size(evaluateQuery(context, qEntityFilter(entity, EntityType.EDGE))) > 0)
          {
              var adjacentFaces = evaluateQuery(context, qAdjacent(entity, AdjacencyType.EDGE, EntityType.FACE));
              selected = append(selected, { "id" : transientId, "kind" : "EDGE", "curve" : evCurveDefinition(context, { "edge" : entity }), "length" : evLength(context, { "entities" : entity }), "faces" : adjacentFaces });
              for (var adjacentFace in adjacentFaces)
                  selected = append(selected, { "id" : adjacentFace.transientId, "kind" : "FACE", "surface" : evSurfaceDefinition(context, { "face" : adjacentFace }), "area" : evArea(context, { "entities" : adjacentFace }), "edges" : evaluateQuery(context, qAdjacent(adjacentFace, AdjacencyType.EDGE, EntityType.EDGE)) });
          }
          else if (size(evaluateQuery(context, qEntityFilter(entity, EntityType.BODY))) > 0)
              selected = append(selected, { "id" : transientId, "kind" : "BODY", "faces" : evaluateQuery(context, qOwnedByBody(entity, EntityType.FACE)), "edges" : evaluateQuery(context, qOwnedByBody(entity, EntityType.EDGE)) });
          else if (size(evaluateQuery(context, qEntityFilter(entity, EntityType.VERTEX))) > 0)
              selected = append(selected, { "id" : transientId, "kind" : "VERTEX", "point" : evVertexPoint(context, { "vertex" : entity }) });
          else
              selected = append(selected, { "id" : transientId, "kind" : "UNKNOWN" });
      }
      var bodies = qBodyType(qEverything(EntityType.BODY), BodyType.SOLID);
      var faces = [];
      for (var face in evaluateQuery(context, qOwnedByBody(bodies, EntityType.FACE)))
          faces = append(faces, { "id" : face.transientId, "kind" : "FACE", "surface" : evSurfaceDefinition(context, { "face" : face }), "area" : evArea(context, { "entities" : face }), "edges" : evaluateQuery(context, qAdjacent(face, AdjacencyType.EDGE, EntityType.EDGE)) });
      var edges = [];
      for (var edge in evaluateQuery(context, qOwnedByBody(bodies, EntityType.EDGE)))
          edges = append(edges, { "id" : edge.transientId, "kind" : "EDGE", "curve" : evCurveDefinition(context, { "edge" : edge }), "length" : evLength(context, { "entities" : edge }), "faces" : evaluateQuery(context, qAdjacent(edge, AdjacencyType.EDGE, EntityType.FACE)) });
      return {
          "selected" : selected,
          "faces" : faces,
          "edges" : edges,
          "createdFaces" : ${createdId ? `evaluateQuery(context, qCreatedBy(makeId(${createdId}), EntityType.FACE))` : "[]"},
          "createdEdges" : ${createdId ? `evaluateQuery(context, qCreatedBy(makeId(${createdId}), EntityType.EDGE))` : "[]"}
      };
  }`;
}

async function readLimitedJson(
  response: Response,
): Promise<RecordValue | null> {
  const text = await response.text();
  if (!response.ok || text.length > MAX_RESPONSE_CHARS) return null;
  try {
    return record(JSON.parse(text));
  } catch {
    return null;
  }
}

function xsrfToken(): string | null {
  const value = document.cookie
    .split("; ")
    .find((part) => part.startsWith("XSRF-TOKEN="))
    ?.slice("XSRF-TOKEN=".length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function evaluateState(
  base: string,
  rollbackBarIndex: number,
  selectedIds: string[],
  createdByFeatureId: string | null,
  expectedMicroversion: string | null,
): Promise<EvaluationState> {
  const token = xsrfToken();
  if (!token)
    return {
      selected: [],
      faces: [],
      edges: [],
      createdFaces: [],
      createdEdges: [],
      sourceMicroversion: null,
      warnings: ["FeatureScript authentication token was unavailable."],
    };
  const request = async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(
        `${base.replace("/api/partstudios/", "/api/v12/partstudios/")}/featurescript?rollbackBarIndex=${rollbackBarIndex}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json;charset=UTF-8; qs=0.09",
            "Content-Type": "application/json;charset=UTF-8; qs=0.09",
            "X-XSRF-TOKEN": token,
          },
          body: JSON.stringify({
            script: buildEvaluationScript(selectedIds, createdByFeatureId),
          }),
        },
      );
      return await readLimitedJson(response);
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  };
  let body = await request();
  let microversion =
    typeof body?.sourceMicroversion === "string"
      ? body.sourceMicroversion
      : null;
  if (body && expectedMicroversion && microversion !== expectedMicroversion) {
    body = await request();
    microversion =
      typeof body?.sourceMicroversion === "string"
        ? body.sourceMicroversion
        : null;
  }
  if (!body)
    return {
      selected: [],
      faces: [],
      edges: [],
      createdFaces: [],
      createdEdges: [],
      sourceMicroversion: null,
      warnings: ["FeatureScript evaluation failed or exceeded its response limit."],
    };
  const result = record(decodeFsValue(body.result));
  const warnings: string[] = [];
  if (expectedMicroversion && microversion !== expectedMicroversion)
    warnings.push("FeatureScript result did not match the feature-list microversion.");
  if (typeof body.console === "string" && body.console.trim())
    warnings.push("FeatureScript returned console output.");
  if (Array.isArray(body.notices) && body.notices.length)
    warnings.push(`FeatureScript returned ${body.notices.length} notice(s).`);
  return {
    selected: normalizeEntities(result?.selected),
    faces: normalizeEntities(result?.faces),
    edges: normalizeEntities(result?.edges),
    createdFaces: queryIds(result?.createdFaces),
    createdEdges: queryIds(result?.createdEdges),
    sourceMicroversion: microversion,
    warnings,
  };
}

function extractInputRoles(feature: RecordValue): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const parameter of Array.isArray(feature.parameters)
    ? feature.parameters
    : []) {
    const item = record(parameter);
    const message = record(item?.message) ?? item;
    const parameterId = message?.parameterId;
    if (!message || typeof parameterId !== "string" || !Array.isArray(message.queries))
      continue;
    const ids = message.queries.flatMap((query) => {
      const queryMessage = record(record(query)?.message) ?? record(query);
      return Array.isArray(queryMessage?.geometryIds)
        ? queryMessage.geometryIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [];
    });
    if (ids.length) result[parameterId] = [...new Set(ids)];
  }
  return result;
}

function featureStates(response: RecordValue): Map<string, string> {
  const states = new Map<string, string>();
  for (const entry of Array.isArray(response.featureStates)
    ? response.featureStates
    : []) {
    const item = record(entry);
    const state = record(record(item?.value)?.message) ?? record(item?.value);
    if (typeof item?.key === "string" && typeof state?.featureStatus === "string")
      states.set(item.key, state.featureStatus);
  }
  return states;
}

function entityMap(state: EvaluationState): Map<string, TopologyEntity> {
  return new Map([...state.faces, ...state.edges].map((entity) => [entity.id, entity]));
}

function signature(entity: TopologyEntity): string {
  return JSON.stringify(entity);
}

function topologyChanges(before: EvaluationState, after: EvaluationState) {
  const beforeMap = entityMap(before);
  const afterMap = entityMap(after);
  const created = [...afterMap.keys()].filter((id) => !beforeMap.has(id));
  const deleted = [...beforeMap.keys()].filter((id) => !afterMap.has(id));
  const modified = [...afterMap.keys()].filter(
    (id) => beforeMap.has(id) && signature(afterMap.get(id)!) !== signature(beforeMap.get(id)!),
  );
  return { beforeMap, afterMap, created, deleted, modified };
}

type EntityBudget = { remaining: number; omitted: number };

function graph(
  rollbackBarIndex: number,
  seedIds: string[],
  primary: TopologyEntity[],
  topology: Map<string, TopologyEntity>,
  budget: EntityBudget,
): TopologyGraph {
  const available = new Map(topology);
  for (const entity of primary) available.set(entity.id, entity);
  const included = new Map<string, TopologyEntity>();
  const include = (id: string) => {
    const entity = available.get(id);
    if (!entity || included.has(id)) return;
    if (budget.remaining <= 0) {
      budget.omitted++;
      return;
    }
    included.set(id, entity);
    budget.remaining--;
  };
  const seeds = [...new Set(seedIds)];
  seeds.forEach(include);
  const directlyRelated = seeds.flatMap((id) => {
    const entity = available.get(id);
    return entity ? [...(entity.edges ?? []), ...(entity.faces ?? [])] : [];
  });
  [...new Set(directlyRelated)].forEach(include);
  const entities = [...included.values()].map((entity) => {
    const next = { ...entity };
    if (entity.edges) {
      next.edges = entity.edges.filter((id) => included.has(id));
      const omitted = entity.edges.length - next.edges.length;
      if (omitted) next.omittedEdgeCount = omitted;
    }
    if (entity.faces) {
      next.faces = entity.faces.filter((id) => included.has(id));
      const omitted = entity.faces.length - next.faces.length;
      if (omitted) next.omittedFaceCount = omitted;
    }
    return next;
  });
  return {
    rollbackBarIndex,
    entities,
    unresolved: seedIds
      .filter((id) => !included.has(id))
      .map((id) => ({
        id,
        reason: available.has(id)
          ? "Omitted by the topology entity limit."
          : "The transient query did not resolve at this rollback.",
      })),
  };
}

async function readJsonResource(base: string, resource: string) {
  try {
    return await readLimitedJson(
      await fetch(`${base}/${resource}`, {
        credentials: "include",
        cache: "no-store",
      }),
    );
  } catch {
    return null;
  }
}

export async function readTopologyModel(
  base: string,
  currentSelectionIds: string[],
): Promise<TopologyModelData> {
  const started = Date.now();
  const [featuresResponse, variablesResponse] = await Promise.all([
    readJsonResource(base, "features"),
    readJsonResource(base, "variables"),
  ]);
  if (!featuresResponse)
    return {
      sourceMicroversion: null,
      variables: variablesResponse,
      features: [],
      currentSelection: null,
      warnings: ["Native Part Studio feature data was unavailable."],
      truncated: { featureCount: 0, entityCount: 0, characterCount: 0 },
    };

  const sourceMicroversion =
    typeof featuresResponse.sourceMicroversion === "string"
      ? featuresResponse.sourceMicroversion
      : null;
  const allFeatures = Array.isArray(featuresResponse.features)
    ? featuresResponse.features
    : [];
  const states = featureStates(featuresResponse);
  const budget: EntityBudget = { remaining: MAX_ENTITIES, omitted: 0 };
  const evaluations: TopologyFeatureEvaluation[] = [];
  const warnings: string[] = [];
  const boundedFeatures = allFeatures.slice(0, MAX_FEATURES);
  let currentSelection: TopologyGraph | null = null;
  if (currentSelectionIds.length) {
    const selectionState = await evaluateState(
      base,
      allFeatures.length,
      currentSelectionIds,
      null,
      sourceMicroversion,
    );
    currentSelection = graph(
      allFeatures.length,
      currentSelectionIds,
      selectionState.selected,
      entityMap(selectionState),
      budget,
    );
    warnings.push(...selectionState.warnings);
  }

  for (let index = 0; index < boundedFeatures.length; index++) {
    if (Date.now() - started >= COLLECTION_TIMEOUT_MS) {
      warnings.push("Topology collection reached its 30 second time limit.");
      break;
    }
    const definition = boundedFeatures[index];
    const feature = unwrapFeature(definition);
    if (!feature) continue;
    const featureId = typeof feature.featureId === "string" ? feature.featureId : null;
    const featureType = typeof feature.featureType === "string" ? feature.featureType : null;
    const suppressed = feature.suppressed === true;
    const isSketch = featureType === "newSketch";
    const inputRoles = isSketch ? {} : extractInputRoles(feature);
    const inputIds = Object.values(inputRoles).flat();
    const featureWarnings: string[] = [];
    let before: EvaluationState = {
      selected: [], faces: [], edges: [], createdFaces: [], createdEdges: [],
      sourceMicroversion, warnings: [],
    };
    let after = before;
    if (!suppressed && !isSketch && featureId) {
      before = await evaluateState(base, index, inputIds, null, sourceMicroversion);
      after = await evaluateState(
        base,
        index + 1,
        [],
        featureId,
        sourceMicroversion,
      );
      featureWarnings.push(...before.warnings, ...after.warnings);
    } else if (suppressed) {
      featureWarnings.push("Suppressed feature was not evaluated.");
    } else if (isSketch) {
      featureWarnings.push("Raw sketch geometry is omitted from topology context.");
    } else {
      featureWarnings.push("Feature ID was unavailable; topology was not evaluated.");
    }
    const changes = topologyChanges(before, after);
    const affectedInputs = graph(
      index,
      inputIds,
      before.selected,
      changes.beforeMap,
      budget,
    );
    const resultingNeighborhood = graph(
      index + 1,
      [...after.createdFaces, ...after.createdEdges],
      after.selected,
      changes.afterMap,
      budget,
    );
    const afterIds = new Set(
      resultingNeighborhood.entities.map((entity) => entity.id),
    );
    const createdFaces = after.createdFaces.filter((id) => afterIds.has(id));
    const createdEdges = after.createdEdges.filter((id) => afterIds.has(id));
    const omittedCreated = [...after.createdFaces, ...after.createdEdges].filter(
      (id) => !afterIds.has(id),
    );
    evaluations.push({
      index,
      featureId,
      name: typeof feature.name === "string" ? feature.name : null,
      featureType,
      status: featureId ? states.get(featureId) ?? null : null,
      suppressed,
      definition,
      inputRoles,
      affectedInputs,
      resultingNeighborhood,
      createdByFeature: {
        faces: createdFaces,
        edges: createdEdges,
        unresolved: omittedCreated.map((id) => ({
          id,
          reason: "Created topology was omitted by the entity limit or unavailable.",
        })),
      },
      unmatchedTopology: {
        postOnlyEntityCount: changes.created.length,
        preOnlyEntityCount: changes.deleted.length,
        retainedButChangedCount: changes.modified.length,
      },
      warnings: [...new Set(featureWarnings)],
    });
  }

  const truncated = {
    featureCount: Math.max(0, allFeatures.length - evaluations.length),
    entityCount: budget.omitted,
    characterCount: 0,
  };
  const result: TopologyModelData = {
    sourceMicroversion,
    variables: variablesResponse,
    features: evaluations,
    currentSelection,
    warnings,
    truncated,
  };
  const initialSerializedLength = JSON.stringify(result).length;
  let serializedLength = initialSerializedLength;
  while (serializedLength > MAX_SERIALIZED_CHARS && result.features.length) {
    result.features.pop();
    result.truncated.featureCount++;
    serializedLength = JSON.stringify(result).length;
  }
  if (serializedLength > MAX_SERIALIZED_CHARS && result.variables !== null) {
    result.variables = null;
    result.warnings.push("Variables were omitted by the serialization limit.");
    serializedLength = JSON.stringify(result).length;
  }
  if (serializedLength > MAX_SERIALIZED_CHARS && result.currentSelection) {
    result.currentSelection = null;
    result.warnings.push(
      "Evaluated current selection was omitted by the serialization limit.",
    );
    serializedLength = JSON.stringify(result).length;
  }
  result.truncated.characterCount = Math.max(
    0,
    initialSerializedLength - serializedLength,
  );
  if (
    result.truncated.featureCount ||
    result.truncated.entityCount ||
    result.truncated.characterCount
  )
    result.warnings.push("Topology context was truncated by collection limits.");
  return result;
}
