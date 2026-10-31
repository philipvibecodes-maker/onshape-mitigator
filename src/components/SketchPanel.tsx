import { useEffect, useState } from "react";
import { featureDialog, sketchHeader, watchDom } from "../adapter/dom";
import type { OnshapeState } from "../types";
export function SketchPanel({
  state,
  collapsed,
  toggle,
}: {
  state: OnshapeState;
  collapsed: boolean;
  toggle: () => void;
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );
  useEffect(() => {
    let patched: HTMLElement | null = null;
    const refresh = () => {
      const dialog = featureDialog(),
        header = sketchHeader();
      const sketch = state.toolbarType === "Sketch";
      if (patched && (patched !== dialog || !sketch || !collapsed)) {
        patched.classList.remove("mitigator-sketch-collapsed");
        patched = null;
      }
      if (!sketch || !header || !dialog) {
        setAnchor((previous) => (previous === null ? previous : null));
        return;
      }
      if (collapsed) {
        dialog.classList.add("mitigator-sketch-collapsed");
        patched = dialog;
      }
      const r = header.getBoundingClientRect();
      let left = r.right + 4;
      let top = r.top + 2;
      // Keep the toggle outside the header's native finish/cancel controls,
      // including when the dialog is dragged to the viewport's right edge.
      if (left + 26 > innerWidth - 4) {
        if (r.left >= 34) left = r.left - 30;
        else {
          left = Math.max(4, Math.min(innerWidth - 30, r.right - 26));
          top = r.top >= 34 ? r.top - 30 : r.bottom + 4;
        }
      }
      const next =
        r.width || r.height
          ? {
              top: Math.max(4, Math.min(innerHeight - 30, top)),
              left: Math.max(4, left),
            }
          : null;
      setAnchor((previous) =>
        previous?.top === next?.top && previous?.left === next?.left
          ? previous
          : next,
      );
    };
    const stop = watchDom(refresh);
    const timer = window.setInterval(refresh, 250);
    window.addEventListener("resize", refresh);
    return () => {
      stop();
      clearInterval(timer);
      window.removeEventListener("resize", refresh);
      patched?.classList.remove("mitigator-sketch-collapsed");
    };
  }, [state.toolbarType, collapsed]);
  return anchor ? (
    <button
      className="sketch-toggle"
      style={{ top: anchor.top, left: anchor.left }}
      onClick={toggle}
      aria-label={collapsed ? "Expand sketch panel" : "Collapse sketch panel"}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand sketch panel" : "Collapse sketch panel"}
    >
      {collapsed ? "⌄" : "⌃"}
    </button>
  ) : null;
}
