import { ChevronsUp, ChevronsDown } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExtensionSettings } from "@/contexts/ExtensionSettingsContext";
import { useOnshapeBridge } from "@/contexts/OnshapeBridgeContext";
import { watchElementPresence } from "@/core/utils";

const DIALOG_SELECTOR = "#feature-dialog";
export const SKETCH_TOOLBAR_COLLAPSED_CLASS =
	"os-mitigator-sketch-toolbar-collapsed";

type Anchor = {
	top: number;
	right: number;
};

function readDialogAnchor(): Anchor | null {
	const header = document.querySelector<HTMLElement>(
		`${DIALOG_SELECTOR} .ns-dialog-header`,
	);
	if (!header) return null;

	const rect = header.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return null;

	return { top: rect.top, right: rect.right };
}

export function SketchToolbarCollapser() {
	const { toolbarType } = useOnshapeBridge();
	const { settings, setSetting } = useExtensionSettings();

	const collapsed = settings.sketchToolbarCollapsed;
	const isSketchMode = toolbarType === "Sketch";

	const [dialogPresent, setDialogPresent] = useState(false);
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const [lastAnchor, setLastAnchor] = useState<Anchor | null>(null);

	useEffect(() => {
		return watchElementPresence(DIALOG_SELECTOR, (present) => {
			setDialogPresent(present);
		});
	}, []);

	useEffect(() => {
		const refresh = () => {
			const next = readDialogAnchor();
			if (next) {
				setAnchor(next);
				setLastAnchor(next);
			}
		};

		refresh();
		window.addEventListener("resize", refresh);
		const interval = window.setInterval(refresh, 500);
		return () => {
			window.removeEventListener("resize", refresh);
			window.clearInterval(interval);
		};
	}, [dialogPresent, isSketchMode, collapsed]);

	useEffect(() => {
		document.body.classList.toggle(
			SKETCH_TOOLBAR_COLLAPSED_CLASS,
			isSketchMode && dialogPresent && collapsed,
		);

		return () => {
			document.body.classList.remove(SKETCH_TOOLBAR_COLLAPSED_CLASS);
		};
	}, [isSketchMode, dialogPresent, collapsed]);

	if (!isSketchMode || !dialogPresent) return null;

	const effectiveAnchor = anchor ?? lastAnchor;
	const binding = settings.keyboardShortcuts.toggleSketchToolbar;
	const bindingSuffix = binding ? ` (${binding})` : "";

	const style: CSSProperties = effectiveAnchor
		? {
				position: "fixed",
				top: effectiveAnchor.top + 2,
				left: effectiveAnchor.right - 26,
			}
		: { position: "fixed", top: 120, left: 560 };

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="secondary"
					size="icon"
					aria-label={
						collapsed ? "Expand sketch panel" : "Collapse sketch panel"
					}
					className="os-plus-glass z-40 h-6 w-6 cursor-pointer rounded-full border border-border shadow-md"
					style={style}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setSetting("sketchToolbarCollapsed", !collapsed);
					}}
				>
					{collapsed ? (
						<ChevronsDown className="h-3.5 w-3.5" />
					) : (
						<ChevronsUp className="h-3.5 w-3.5" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{collapsed
					? `Expand the sketch panel${bindingSuffix}`
					: `Collapse the sketch panel${bindingSuffix}`}
			</TooltipContent>
		</Tooltip>
	);
}
