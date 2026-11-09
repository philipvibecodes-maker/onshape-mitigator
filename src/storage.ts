import browser from "webextension-polyfill";
import {
  NUMPAD_CODES,
  STANDARD_VIEWS,
  type ActionId,
  type NumpadViewMappings,
  type Settings,
} from "./types";
import { parseBinding } from "./shortcuts";
export const ACTIONS: Record<ActionId, string> = {
  openExtensionMenu: "Open extension menu",
  openVariablesTable: "Toggle variables table",
  toggleSketchToolbar: "Toggle sketch panel",
  toggleSketchDimensions: "Toggle sketch dimensions",
  copyAiContext: "Copy context for AI",
  openSettings: "Open settings",
};
export const DEFAULT_NUMPAD_VIEW_MAPPINGS: NumpadViewMappings = {
  Numpad0: null,
  Numpad1: "front",
  Numpad2: "bottom",
  Numpad3: "back",
  Numpad4: "left",
  Numpad5: "isometric",
  Numpad6: "right",
  Numpad7: null,
  Numpad8: "top",
  Numpad9: null,
};
export const DEFAULTS: Settings = {
  settingsVersion: 4,
  extensionEnabled: true,
  sketchToolbarCollapsed: false,
  sketchDimensionsHidden: false,
  keyboardShortcuts: {
    openExtensionMenu: "Alt+M",
    openVariablesTable: "Alt+V",
    toggleSketchToolbar: "Alt+Shift+T",
    toggleSketchDimensions: "Alt+Shift+D",
    copyAiContext: "Alt+Shift+C",
    openSettings: "Alt+S",
  },
  numpadViewMappings: { ...DEFAULT_NUMPAD_VIEW_MAPPINGS },
  aiChatbotUrl: "https://chatgpt.com/?q={context}",
  aiOpenAfterCopy: true,
};
export function migrateSettings(raw: Record<string, unknown>): Settings {
  const next: Settings = {
    ...DEFAULTS,
    keyboardShortcuts: { ...DEFAULTS.keyboardShortcuts },
    numpadViewMappings: { ...DEFAULTS.numpadViewMappings },
  };
  for (const key of [
    "extensionEnabled",
    "sketchToolbarCollapsed",
    "sketchDimensionsHidden",
    "aiOpenAfterCopy",
  ] as const)
    if (typeof raw[key] === "boolean") next[key] = raw[key];
  if (typeof raw.aiChatbotUrl === "string")
    next.aiChatbotUrl = raw.aiChatbotUrl;
  const bindings = raw.keyboardShortcuts;
  if (bindings && typeof bindings === "object") {
    for (const id of Object.keys(ACTIONS) as ActionId[]) {
      const binding = (bindings as Record<string, unknown>)[id];
      if (typeof binding === "string" && (!binding || parseBinding(binding)))
        next.keyboardShortcuts[id] = binding;
    }
  }
  const numpadMappings = raw.numpadViewMappings;
  if (numpadMappings && typeof numpadMappings === "object") {
    for (const code of NUMPAD_CODES) {
      const view = (numpadMappings as Record<string, unknown>)[code];
      if (view === null || STANDARD_VIEWS.includes(view as never))
        next.numpadViewMappings[code] = view as NumpadViewMappings[typeof code];
    }
  }
  // Existing duplicate bindings must not execute two actions; keep the first.
  const seen = new Set<string>();
  for (const id of Object.keys(ACTIONS) as ActionId[]) {
    const binding = next.keyboardShortcuts[id];
    const normalized = JSON.stringify(parseBinding(binding));
    if (binding && seen.has(normalized)) next.keyboardShortcuts[id] = "";
    else if (binding) seen.add(normalized);
  }
  return next;
}
export async function loadSettings(): Promise<Settings> {
  const raw = await browser.storage.local.get(Object.keys(DEFAULTS));
  const settings = migrateSettings(raw);
  if (raw.settingsVersion !== 4) await browser.storage.local.set(settings);
  return settings;
}
export async function saveSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}
export async function getStorageItem<K extends keyof Settings>(
  key: K,
): Promise<Settings[K]> {
  return (await loadSettings())[key];
}
