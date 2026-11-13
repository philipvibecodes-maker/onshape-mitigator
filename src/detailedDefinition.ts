export type DetailedJson =
  | null
  | boolean
  | number
  | string
  | DetailedJson[]
  | { [key: string]: DetailedJson };

type JsonObject = { [key: string]: DetailedJson };
type NativeNode = {
  type: string;
  canonicalType: string;
  payload: JsonObject;
  envelope: JsonObject;
};

const SHORT_PARAMETER_TYPES = new Set([
  "BTMParameterBoolean",
  "BTMParameterString",
  "BTMParameterQuantity",
  "BTMParameterEnum",
  "BTMParameterQueryList",
]);

function isObject(value: DetailedJson): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value: unknown): DetailedJson | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((child) => parseJson(child) ?? null);
  if (typeof value !== "object" || value === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const parsed = parseJson(child);
      return parsed === undefined ? [] : [[key, parsed]];
    }),
  );
}

function canonicalType(value: string): string | null {
  const name = value.split(".").at(-1)?.replace(/-\d+$/, "");
  return name?.startsWith("BT") ? name : null;
}

function nativeNode(value: JsonObject): NativeNode | null {
  const declarations = [value.typeName, value.btType].filter(
    (type): type is string => typeof type === "string",
  );
  const type = declarations[0];
  if (!type) return null;
  const canonical = canonicalType(type);
  if (
    !canonical ||
    declarations.some((name) => canonicalType(name) !== canonical)
  )
    return null;
  const fields = Object.fromEntries(
    Object.entries(value).filter(
      ([key, child]) =>
        key !== "typeName" &&
        key !== "btType" &&
        !(key === "type" && typeof child === "number"),
    ),
  );
  if (isObject(value.message)) {
    const { message: _message, ...envelope } = fields;
    return { type, canonicalType: canonical, payload: value.message, envelope };
  }
  return { type, canonicalType: canonical, payload: fields, envelope: {} };
}

function onlyKeys(value: JsonObject, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function simpleQueryIds(value: DetailedJson): string[] | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const query = value[0];
  if (!query || !isObject(query)) return null;
  const node = nativeNode(query);
  if (
    node &&
    (node.canonicalType !== "BTMIndividualQuery" ||
      Object.keys(node.envelope).length)
  )
    return null;
  const payload = node
    ? node.payload
    : onlyKeys(query, ["message"]) && isObject(query.message)
      ? query.message
      : query;
  if (!onlyKeys(payload, ["geometryIds"]) || !Array.isArray(payload.geometryIds))
    return null;
  const ids = payload.geometryIds;
  return ids.length > 0 && ids.every((id): id is string => typeof id === "string")
    ? ids
    : null;
}

function parameterValue(value: JsonObject): DetailedJson {
  const node = nativeNode(value);
  if (!node) {
    const { parameterId: _parameterId, ...fields } = value;
    return translate(fields);
  }
  const { parameterId: _parameterId, ...payload } = node.payload;
  const parameter = { ...node, payload };
  if (!Object.keys(node.envelope).length) {
    switch (node.canonicalType) {
      case "BTMParameterBoolean":
        if (onlyKeys(payload, ["value"]) && typeof payload.value === "boolean")
          return payload.value;
        break;
      case "BTMParameterString":
        if (onlyKeys(payload, ["value"]) && typeof payload.value === "string")
          return payload.value;
        break;
      case "BTMParameterQuantity":
        if (
          onlyKeys(payload, ["expression"]) &&
          typeof payload.expression === "string" &&
          payload.expression.trim()
        )
          return payload.expression;
        break;
      case "BTMParameterEnum":
        if (
          onlyKeys(payload, ["enumName", "value"]) &&
          typeof payload.enumName === "string" &&
          typeof payload.value === "string"
        )
          return { enum: payload.enumName, value: payload.value };
        break;
      case "BTMParameterQueryList": {
        const ids = onlyKeys(payload, ["queries"])
          ? simpleQueryIds(payload.queries)
          : null;
        if (ids) return { QueryList: ids.length === 1 ? ids[0] : ids };
        break;
      }
    }
  }
  return translateNative(parameter);
}

function translateParameters(values: DetailedJson[]): DetailedJson {
  const entries: Array<[string, JsonObject]> = [];
  const names = new Set<string>();
  for (const value of values) {
    if (!isObject(value)) return values.map(translate);
    const node = nativeNode(value);
    const id = (node?.payload ?? value).parameterId;
    if (typeof id !== "string" || !id.trim() || names.has(id))
      return values.map(translate);
    names.add(id);
    entries.push([id, value]);
  }
  return Object.fromEntries(
    entries.map(([id, value]) => [id, parameterValue(value)]),
  );
}

function translateFields(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "parameters" && Array.isArray(child)
        ? translateParameters(child)
        : translate(child),
    ]),
  );
}

function translateNative(node: NativeNode): DetailedJson {
  const payload = translateFields(node.payload);
  const envelope = translateFields(node.envelope);
  if (Object.keys(envelope).some((key) => Object.hasOwn(payload, key)))
    return { $type: node.type, $message: payload, $wrapper: envelope };
  const fields = { ...envelope, ...payload };
  const redundant =
    ((node.canonicalType === "BTMFeature" ||
      node.canonicalType === "BTMSketch") &&
      typeof fields.featureType === "string") ||
    (node.canonicalType === "BTMSketchConstraint" &&
      typeof fields.constraintType === "string");
  if (redundant) return fields;
  if (Object.hasOwn(fields, "kind"))
    return { $type: node.type, $message: payload, $wrapper: envelope };
  const shortType =
    SHORT_PARAMETER_TYPES.has(node.canonicalType) ||
    node.canonicalType === "BTMIndividualQuery" ||
    node.canonicalType === "BTMIndividualSketchRegionQuery" ||
    node.canonicalType.startsWith("BTMSketch") ||
    node.canonicalType.startsWith("BTCurveGeometry") ||
    node.canonicalType === "BTFeatureState";
  const kind = shortType
    ? node.canonicalType.replace(/^BTM?(?:Parameter)?/, "")
    : node.type;
  return { kind, ...fields };
}

function translate(value: DetailedJson): DetailedJson {
  if (Array.isArray(value)) return value.map(translate);
  if (!isObject(value)) return value;
  const node = nativeNode(value);
  return node ? translateNative(node) : translateFields(value);
}

export function translateDetailedDefinition(value: unknown): DetailedJson {
  return translate(parseJson(value) ?? null);
}
