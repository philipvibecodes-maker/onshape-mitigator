export type OnshapeToolbarMode =
  | "Sketch"
  | "Part Studio"
  | "Assembly"
  | "Drawing";
export type Selection = { kind: string; id?: string; name?: string };
export type ModelData = {
  features: unknown | null;
  variables: unknown | null;
};
export type OnshapeState = {
  ready: boolean;
  toolbarType: OnshapeToolbarMode | null;
  currentTool: string | null;
};
export type ActionId =
  | "openExtensionMenu"
  | "openVariablesTable"
  | "toggleSketchToolbar"
  | "toggleSketchDimensions"
  | "copyAiContext"
  | "openSettings";
export type Bindings = Record<ActionId, string>;
export const NUMPAD_CODES = [
  "Numpad0",
  "Numpad1",
  "Numpad2",
  "Numpad3",
  "Numpad4",
  "Numpad5",
  "Numpad6",
  "Numpad7",
  "Numpad8",
  "Numpad9",
] as const;
export type NumpadCode = (typeof NUMPAD_CODES)[number];
export const STANDARD_VIEWS = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "isometric",
] as const;
export type StandardView = (typeof STANDARD_VIEWS)[number];
export type NumpadViewMappings = Record<NumpadCode, StandardView | null>;
export type Settings = {
  settingsVersion: 4;
  extensionEnabled: boolean;
  sketchToolbarCollapsed: boolean;
  sketchDimensionsHidden: boolean;
  keyboardShortcuts: Bindings;
  numpadViewMappings: NumpadViewMappings;
  aiChatbotUrl: string;
  aiOpenAfterCopy: boolean;
};
