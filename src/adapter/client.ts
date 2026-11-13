import {
  REQUEST,
  RESPONSE,
  SET_DIMENSIONS_HIDDEN,
  EXECUTE_STANDARD_VIEW,
  isSelections,
  isModelData,
  isTopologyModelData,
  isState,
  type ReadKind,
} from "./protocol";
import type {
  ModelData,
  TopologyModelData,
  OnshapeState,
  Selection,
  StandardView,
} from "../types";
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
  kind: "topology-model",
  timeoutMs?: number,
): Promise<TopologyModelData>;
export function readPage(
  kind: ReadKind,
  timeoutMs = 1500,
): Promise<OnshapeState | Selection[] | ModelData | TopologyModelData> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (
      value: OnshapeState | Selection[] | ModelData | TopologyModelData,
    ) => {
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
            : kind === "model"
              ? isModelData(v.data)
              : isTopologyModelData(v.data);
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
              : kind === "model"
                ? { features: null, variables: null }
                : {
                    sourceMicroversion: null,
                    variables: null,
                    features: [],
                    currentSelection: null,
                    warnings: ["Topology collection timed out."],
                    truncated: {
                      featureCount: 0,
                      entityCount: 0,
                      characterCount: 0,
                    },
                  },
        ),
      timeoutMs,
    );
    window.addEventListener("message", onMessage);
    window.postMessage({ type: REQUEST, requestId, kind }, location.origin);
  });
}
export function setSketchDimensionsHidden(hidden: boolean): void {
  window.postMessage(
    { type: SET_DIMENSIONS_HIDDEN, hidden },
    location.origin,
  );
}
export function executeStandardView(view: StandardView): void {
  window.postMessage(
    { type: EXECUTE_STANDARD_VIEW, view },
    location.origin,
  );
}
export { toggleVariablesTable } from "./dom";
