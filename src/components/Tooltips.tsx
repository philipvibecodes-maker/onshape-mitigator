import { useEffect } from "react";
import labels from "../adapter/tool-labels.json";
export function Tooltips() {
  useEffect(() => {
    const tooltip = document.createElement("div");
    tooltip.id = "mitigator-tooltip";
    tooltip.role = "tooltip";
    Object.assign(tooltip.style, {
      position: "fixed",
      padding: "4px 8px",
      background: "#182231",
      color: "white",
      borderRadius: "5px",
      font: "12px system-ui",
      pointerEvents: "none",
      zIndex: "2147483647",
      maxWidth: "calc(100vw - 16px)",
      overflowWrap: "anywhere",
      display: "none",
    });
    document.body.append(tooltip);
    let active: HTMLElement | null = null;
    const hide = () => {
      tooltip.style.display = "none";
      active = null;
    };
    const show = (event: Event) => {
      const item = (event.target as Element)?.closest<HTMLElement>(
        ".os-mini-toolbar-panel .os-tool-item[icon]",
      );
      if (!item) {
        hide();
        return;
      }
      const icon = (item.getAttribute("icon") ?? "").replace(/^svg-icon-/, "");
      const label =
        item.getAttribute("aria-label") ||
        item.getAttribute("title") ||
        (labels as Record<string, string>)[icon];
      if (!label) {
        hide();
        return;
      }
      active = item;
      tooltip.textContent = label;
      tooltip.style.display = "block";
      const rect = item.getBoundingClientRect(),
        bounds = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(innerWidth - bounds.width - 8, rect.left + rect.width / 2 - bounds.width / 2))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(innerHeight - bounds.height - 8, rect.top >= bounds.height + 8 ? rect.top - bounds.height - 8 : rect.bottom + 8))}px`;
    };
    const out = (event: MouseEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !active?.contains(event.relatedTarget)
      )
        hide();
    };
    const observer = new MutationObserver(() => {
      if (active && (!active.isConnected || !active.getClientRects().length))
        hide();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    document.addEventListener("mouseover", show);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("mousedown", hide);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      observer.disconnect();
      tooltip.remove();
      document.removeEventListener("mouseover", show);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  return null;
}
