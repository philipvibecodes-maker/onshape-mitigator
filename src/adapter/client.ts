import {
  REQUEST,
  RESPONSE,
  isSelections,
  isState,
  type ReadKind,
} from "./protocol";
import type { OnshapeState, Selection } from "../types";
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
export function readPage(
  kind: ReadKind,
  timeoutMs = 1500,
): Promise<OnshapeState | Selection[]> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (value: OnshapeState | Selection[]) => {
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
      if (kind === "state" ? isState(v.data) : isSelections(v.data))
        finish(v.data);
    };
    const timer = window.setTimeout(
      () => finish(kind === "state" ? { ...EMPTY_STATE } : []),
      timeoutMs,
    );
    window.addEventListener("message", onMessage);
    window.postMessage({ type: REQUEST, requestId, kind }, location.origin);
  });
}
export { toggleVariablesTable } from "./dom";
