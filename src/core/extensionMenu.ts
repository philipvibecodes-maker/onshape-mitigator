import { useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";

export const TOGGLE_EXTENSION_MENU = "onshape-mitigator:toggle-menu";

export function useExtensionMenu() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const onMessage = (message: unknown) => {
			if (
				typeof message === "object" &&
				message !== null &&
				"type" in message &&
				message.type === TOGGLE_EXTENSION_MENU
			) {
				setOpen((value) => !value);
			}
		};
		browser.runtime.onMessage.addListener(onMessage);
		return () => browser.runtime.onMessage.removeListener(onMessage);
	}, []);

	const closeMenu = useCallback(() => setOpen(false), []);
	return { open, closeMenu };
}
