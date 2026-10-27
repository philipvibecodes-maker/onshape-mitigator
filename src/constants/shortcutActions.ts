export type ShortcutActionId =
	| "openExtensionMenu"
	| "openVariablesTable"
	| "togglePenSidebar"
	| "toggleSketchToolbar"
	| "copyAiContext"
	| "openSettings";

export type ShortcutActionDefinition = {
	id: ShortcutActionId;
	label: string;
	description: string;
};

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
	{
		id: "openExtensionMenu",
		label: "Open extension menu",
		description: "Show the Onshape Mitigator menu.",
	},
	{
		id: "openVariablesTable",
		label: "Open variables table",
		description: "Toggle the Onshape variable table panel.",
	},
	{
		id: "togglePenSidebar",
		label: "Toggle sidebar",
		description: "Collapse or expand the Onshape Mitigator sidebar.",
	},
	{
		id: "toggleSketchToolbar",
		label: "Toggle sketch panel",
		description:
			"Collapse or expand the sketch options panel (keeps finish/cancel visible).",
	},
	{
		id: "copyAiContext",
		label: "Copy context for AI",
		description:
			"Copy a snapshot of the current document state to the clipboard.",
	},
	{
		id: "openSettings",
		label: "Open extension settings",
		description: "Open the Onshape Mitigator settings dialog.",
	},
];
