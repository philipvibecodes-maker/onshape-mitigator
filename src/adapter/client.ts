import {
  REQUEST,
  RESPONSE,
  isSelections,
  isModelData,
  isState,
  type ReadKind,
} from "./protocol";
import type { ModelData, OnshapeState, Selection } from "../types";
export const EMPTY_STATE: OnshapeState = {
  ready: false,
  toolbarType: null,
  currentTool: null,
};
export function readPage(
  kind: "state",
  timeoutMs?: number,
): Promise<OnshapeState>;
export function readPage(
  kind: "selections",
  timeoutMs?: number,
): Promise<Selection[]>;
export function readPage(kind: "model", timeoutMs?: number): Promise<ModelData>;
export function readPage(
  kind: ReadKind,
  timeoutMs = 1500,
): Promise<OnshapeState | Selection[] | ModelData> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (value: OnshapeState | Selection[] | ModelData) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const v = event.data;
      if (
        !v ||
        v.type !== RESPONSE ||
        v.requestId !== requestId ||
        v.kind !== kind
      )
        return;
      const valid =
        kind === "state"
          ? isState(v.data)
          : kind === "selections"
            ? isSelections(v.data)
            : isModelData(v.data);
      if (valid)
        finish(v.data);
    };
    const timer = window.setTimeout(
      () =>
        finish(
          kind === "state"
            ? { ...EMPTY_STATE }
            : kind === "selections"
              ? []
              : { features: null, variables: null },
        ),
      timeoutMs,
    );
    window.addEventListener("message", onMessage);
    window.postMessage({ type: REQUEST, requestId, kind }, location.origin);
  });
}
export { toggleVariablesTable } from "./dom";
