import { useEffect, useMemo } from "react";
import { useOnshapeBridge } from "@/contexts/OnshapeBridgeContext";
import { watchElementPresence } from "@/core/utils";

const MINI_TOOLBAR_SELECTOR = ".os-mini-toolbar-panel";
const TOOL_ITEM_SELECTOR = ".os-tool-item[icon]";
const TOOLTIP_ID = "os-mitigator-mini-tooltip";

function stripPrefix(value?: string): string | null {
	if (!value) return null;
	const stripped = value
		.replace(/^server:::/, "")
		.replace(/^tooltips:::/, "")
		.trim();
	return stripped || null;
}

export function MiniToolbarTooltips() {
	const { allAvailableTools } = useOnshapeBridge();

	const labelsByIcon = useMemo(() => {
		const map = new Map<string, string>();

		for (const group of allAvailableTools) {
			for (const command of group.commands) {
				if (!command.icon) continue;
				const icon = command.icon.replace(/^svg-icon-/, "");
				if (map.has(icon)) continue;

				const label = stripPrefix(command.name);
				if (label) map.set(icon, label);
			}
		}

		return map;
	}, [allAvailableTools]);

	useEffect(() => {
		let panelObserver: MutationObserver | null = null;
		let tooltipEl: HTMLElement | null = null;
		let detachListeners: (() => void) | null = null;

		const hideTooltip = () => {
			if (tooltipEl) tooltipEl.style.opacity = "0";
		};

		const showTooltipFor = (item: HTMLElement) => {
			if (!tooltipEl) return;

			const icon = item.getAttribute("icon");
			const label = icon ? labelsByIcon.get(icon) : undefined;
			if (!label) {
				hideTooltip();
				return;
			}

			tooltipEl.textContent = label;
			const rect = item.getBoundingClientRect();
			tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
			tooltipEl.style.top = `${rect.top}px`;
			tooltipEl.style.opacity = "1";
		};

		const attach = (present: boolean) => {
			panelObserver?.disconnect();
			panelObserver = null;
			detachListeners?.();
			detachListeners = null;
			tooltipEl?.remove();
			tooltipEl = null;
			if (!present) return;

			const panel = document.querySelector<HTMLElement>(MINI_TOOLBAR_SELECTOR);
			if (!panel) return;

			tooltipEl = document.createElement("div");
			tooltipEl.id = TOOLTIP_ID;
			document.body.appendChild(tooltipEl);

			const onMouseOver = (event: MouseEvent) => {
				const item = (event.target as HTMLElement | null)?.closest?.(
					TOOL_ITEM_SELECTOR,
				);
				if (item instanceof HTMLElement && panel.contains(item)) {
					showTooltipFor(item);
				}
			};
			const onMouseOut = (event: MouseEvent) => {
				const item = (event.target as HTMLElement | null)?.closest?.(
					TOOL_ITEM_SELECTOR,
				);
				const related = event.relatedTarget;
				if (
					item instanceof HTMLElement &&
					(!(related instanceof HTMLElement) || !item.contains(related))
				) {
					hideTooltip();
				}
			};

			panel.addEventListener("mouseover", onMouseOver);
			panel.addEventListener("mouseout", onMouseOut);
			panel.addEventListener("mousedown", hideTooltip);
			detachListeners = () => {
				panel.removeEventListener("mouseover", onMouseOver);
				panel.removeEventListener("mouseout", onMouseOut);
				panel.removeEventListener("mousedown", hideTooltip);
			};

			panelObserver = new MutationObserver(() => hideTooltip());
			panelObserver.observe(panel, { childList: true, subtree: true });
		};

		return watchElementPresence(MINI_TOOLBAR_SELECTOR, attach);
	}, [labelsByIcon]);

	return null;
}
