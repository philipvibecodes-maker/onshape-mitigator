import "../../src/main";
import {
	ACCEPTED_ONSHAPE_TO_EXTENSION_EVENT_TYPE as type,
	FORWARDED_ONSHAPE_EVENTS as events,
} from "../../src/constants/onshapeEvents";
const timer = setInterval(() => {
	window.postMessage({ type, name: events.ENABLE_TOOLBAR }, location.origin);
	window.postMessage(
		{
			type,
			name: events.CHANGE_ELEMENT_TOOLBAR,
			args: [{ toolbarName: "Sketch" }],
		},
		location.origin,
	);
	if (
		document
			.querySelector("#onshape-extension-host")
			?.shadowRoot?.querySelector('button[aria-label="Collapse sketch panel"]')
	)
		clearInterval(timer);
}, 50);

import { clickExtensionIcon } from "./browser";
(window as any).clickExtensionIcon = clickExtensionIcon;
