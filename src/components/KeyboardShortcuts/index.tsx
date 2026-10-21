import { useEffect, useMemo, useRef } from "react";
import { isTypingTarget } from "@/components/floating-cad-keyboard/keyboardUtils";
import type { ShortcutActionId } from "@/constants/shortcutActions";
import { useExtensionSettings } from "@/contexts/ExtensionSettingsContext";
import { useOnshapeBridge } from "@/contexts/OnshapeBridgeContext";
import { useSettingsDialog } from "@/contexts/SettingsDialogContext";
import { copyAiContextToClipboard } from "@/core/aiContext";
import { matchesBinding } from "@/core/keyboardShortcuts";
import { toggleVariablesTable } from "@/core/nativeActions";

function isInsideExtensionUi(event: KeyboardEvent): boolean {
	return event
		.composedPath()
		.some(
			(node) =>
				node instanceof HTMLElement && node.id === "onshape-extension-host",
		);
}

export function KeyboardShortcuts() {
	const { settings, setSetting } = useExtensionSettings();
	const { openSettings } = useSettingsDialog();
	const { toolbarType, currentTool } = useOnshapeBridge();

	const handlers = useMemo<Record<ShortcutActionId, () => void>>(
		() => ({
			openVariablesTable: () => {
				toggleVariablesTable();
			},
			togglePenSidebar: () => {
				setSetting("penSidebarCollapsed", !settings.penSidebarCollapsed);
			},
			toggleSketchToolbar: () => {
				setSetting("sketchToolbarCollapsed", !settings.sketchToolbarCollapsed);
			},
			copyAiContext: () => {
				void copyAiContextToClipboard({ toolbarType, currentTool });
			},
			openSettings: () => {
				openSettings();
			},
		}),
		[
			settings.penSidebarCollapsed,
			settings.sketchToolbarCollapsed,
			setSetting,
			openSettings,
			toolbarType,
			currentTool,
		],
	);

	const bindings = settings.keyboardShortcuts;
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (isTypingTarget(event.target)) return;
			if (isInsideExtensionUi(event)) return;

			for (const [actionId, binding] of Object.entries(bindings)) {
				if (!binding) continue;
				if (!matchesBinding(event, binding)) continue;

				const handler = handlersRef.current[actionId as ShortcutActionId];
				if (!handler) return;

				event.preventDefault();
				event.stopPropagation();
				handler();
				return;
			}
		}

		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [bindings]);

	return null;
}
