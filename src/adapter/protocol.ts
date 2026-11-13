import {
  STANDARD_VIEWS,
  type ModelData,
  type TopologyModelData,
  type OnshapeState,
  type Selection,
  type StandardView,
} from "../types";
export const REQUEST = "onshape-mitigator:read";
export const RESPONSE = "onshape-mitigator:result";
export const SET_DIMENSIONS_HIDDEN =
  "onshape-mitigator:set-sketch-dimensions-hidden";
export const EXECUTE_STANDARD_VIEW =
  "onshape-mitigator:execute-standard-view";
export type ReadKind = "state" | "selections" | "model" | "topology-model";
export type ReadRequest = {
  type: typeof REQUEST;
  requestId: string;
  kind: ReadKind;
};
export function isRequest(value: unknown): value is ReadRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === REQUEST &&
    typeof v.requestId === "string" &&
    v.requestId.length > 0 &&
    v.requestId.length <= 100 &&
    (v.kind === "state" ||
      v.kind === "selections" ||
      v.kind === "model" ||
      v.kind === "topology-model")
  );
}
export function isSetDimensionsHiddenRequest(
  value: unknown,
): value is { type: typeof SET_DIMENSIONS_HIDDEN; hidden: boolean } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === SET_DIMENSIONS_HIDDEN && typeof v.hidden === "boolean";
}
export function isExecuteStandardViewRequest(
  value: unknown,
): value is {
  type: typeof EXECUTE_STANDARD_VIEW;
  view: StandardView;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === EXECUTE_STANDARD_VIEW &&
    STANDARD_VIEWS.includes(v.view as never)
  );
}
export function isState(value: unknown): value is OnshapeState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ready === "boolean" &&
    (v.toolbarType === null ||
      ["Sketch", "Part Studio", "Assembly", "Drawing"].includes(
        v.toolbarType as string,
      )) &&
    (v.currentTool === null || typeof v.currentTool === "string")
  );
}
export function isSelections(value: unknown): value is Selection[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        s &&
        typeof s === "object" &&
        typeof s.kind === "string" &&
        (s.id === undefined || typeof s.id === "string") &&
        (s.name === undefined || typeof s.name === "string"),
    )
  );
}
export function isModelData(value: unknown): value is ModelData {
  return (
    !!value &&
    typeof value === "object" &&
    "features" in value &&
    "variables" in value
  );
}
export function isTopologyModelData(value: unknown): value is TopologyModelData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.features) &&
    Array.isArray(v.warnings) &&
    !!v.truncated &&
    typeof v.truncated === "object"
  );
}
