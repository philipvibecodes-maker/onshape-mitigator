import browser from "webextension-polyfill";
import type { ActionId, Settings } from "./types";
import { parseBinding } from "./shortcuts";
export const ACTIONS: Record<ActionId, string> = {
  openExtensionMenu: "Open extension menu",
  openVariablesTable: "Toggle variables table",
  toggleSketchToolbar: "Toggle sketch panel",
  copyAiContext: "Copy context for AI",
  openSettings: "Open settings",
};
export const DEFAULTS: Settings = {
  settingsVersion: 3,
  extensionEnabled: true,
  sketchToolbarCollapsed: false,
  keyboardShortcuts: {
    openExtensionMenu: "Alt+M",
    openVariablesTable: "Alt+V",
    toggleSketchToolbar: "Alt+Shift+T",
    copyAiContext: "Alt+Shift+C",
    openSettings: "",
  },
  aiChatbotUrl: "https://chatgpt.com/?q={context}",
  aiOpenAfterCopy: true,
};
export function migrateSettings(raw: Record<string, unknown>): Settings {
  const next: Settings = {
    ...DEFAULTS,
    keyboardShortcuts: { ...DEFAULTS.keyboardShortcuts },
  };
  for (const key of [
    "extensionEnabled",
    "sketchToolbarCollapsed",
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
  if (raw.settingsVersion !== 3) await browser.storage.local.set(settings);
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
