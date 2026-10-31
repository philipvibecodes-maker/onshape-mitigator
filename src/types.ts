export type OnshapeToolbarMode =
  | "Sketch"
  | "Part Studio"
  | "Assembly"
  | "Drawing";
export type Selection = { kind: string; id?: string; name?: string };
export type OnshapeState = {
  ready: boolean;
  toolbarType: OnshapeToolbarMode | null;
  currentTool: string | null;
};
export type ActionId =
  | "openExtensionMenu"
  | "openVariablesTable"
  | "toggleSketchToolbar"
  | "copyAiContext"
  | "openSettings";
export type Bindings = Record<ActionId, string>;
export type Settings = {
  settingsVersion: 3;
  extensionEnabled: boolean;
  sketchToolbarCollapsed: boolean;
  keyboardShortcuts: Bindings;
  aiChatbotUrl: string;
  aiOpenAfterCopy: boolean;
};
