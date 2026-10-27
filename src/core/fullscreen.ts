import { useEffect, useRef } from "react";

type KeyboardLock = {
	lock: (keys: string[]) => Promise<void>;
	unlock: () => void;
};

function hasVisibleEscapeTarget(): boolean {
	const roots: ParentNode[] = [document];
	const shadow = document.querySelector("#onshape-extension-host")?.shadowRoot;
	if (shadow) roots.push(shadow);
	return roots.some((root) =>
		Array.from(
			root.querySelectorAll<HTMLElement>(
				'#feature-dialog, [role="dialog"], [role="alertdialog"], [role="menu"], .dropdown-menu, .context-menu, .os-mini-toolbar-panel',
			),
		).some(
			(element) =>
				element.getClientRects().length > 0 &&
				getComputedStyle(element).visibility !== "hidden",
		),
	);
}

// Keep this mounted even when the extension menu is hidden. Observe the mode
// during capture, before Onshape can cancel it in response to the same Escape.
export function useFullscreenEscape(currentTool: string | null) {
	const tool = useRef(currentTool);
	tool.current = currentTool;

	useEffect(() => {
		const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock })
			.keyboard;
		let generation = 0;
		let locked = false;
		let disposed = false;

		async function onFullscreenChange() {
			const request = ++generation;
			locked = false;
			const fullscreen = !!document.fullscreenElement;
			document.body.classList.toggle(
				"onshape-plus-fullscreen-mode",
				fullscreen,
			);
			if (!keyboard?.lock) return;
			if (!fullscreen) {
				keyboard.unlock();
				return;
			}
			try {
				await keyboard.lock(["Escape"]);
				if (disposed || !document.fullscreenElement) {
					keyboard.unlock();
				} else if (request === generation) {
					locked = true;
				}
			} catch {
				// Unsupported or denied: retain the browser's normal fullscreen exit.
			}
		}

		function onKeyDown(event: KeyboardEvent) {
			if (!locked || !document.fullscreenElement || event.key !== "Escape")
				return;
			if (event.repeat || event.isComposing) return;
			if (tool.current || hasVisibleEscapeTarget()) return;
			const fullscreenElement = document.fullscreenElement;
			window.setTimeout(() => {
				// Let native/extension handlers consume Escape before the fallback.
				if (
					!disposed &&
					!event.defaultPrevented &&
					document.fullscreenElement === fullscreenElement
				) {
					void document.exitFullscreen().catch(() => {});
				}
			});
		}

		document.addEventListener("fullscreenchange", onFullscreenChange);
		window.addEventListener("keydown", onKeyDown, true);
		void onFullscreenChange();
		return () => {
			disposed = true;
			++generation;
			keyboard?.unlock();
			document.removeEventListener("fullscreenchange", onFullscreenChange);
			window.removeEventListener("keydown", onKeyDown, true);
			document.body.classList.remove("onshape-plus-fullscreen-mode");
		};
	}, []);
}
