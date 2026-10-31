import type { OnshapeState, Selection } from "../types";
export const REQUEST = "onshape-mitigator:read";
export const RESPONSE = "onshape-mitigator:result";
export type ReadKind = "state" | "selections";
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
    (v.kind === "state" || v.kind === "selections")
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
