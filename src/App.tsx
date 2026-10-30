import { useCallback, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import type {
  ActionId,
  OnshapeState,
  Settings as SettingsValue,
} from "./types";
import { loadSettings, saveSetting } from "./storage";
import { EMPTY_STATE, readPage, toggleVariablesTable } from "./adapter/client";
import { isDocumentPage } from "./adapter/dom";
import { matchesBinding } from "./shortcuts";
import { copyAiContextToClipboard, showToast } from "./aiContext";
import { Tooltips } from "./components/Tooltips";
import { SketchPanel } from "./components/SketchPanel";
import { Settings } from "./components/Settings";

export function App({ initial }: { initial: SettingsValue }) {
  const [settings, setSettings] = useState(initial);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<OnshapeState>(EMPTY_STATE);
  const [documentPage, setDocumentPage] = useState(isDocumentPage());
  const [copying, setCopying] = useState(false);
  const menuElement = useRef<HTMLElement>(null);
  const copyInFlight = useRef(false);
  const enabled = settings.extensionEnabled;
  const update = useCallback(async () => setSettings(await loadSettings()), []);
  useEffect(() => {
    let mounted = true;
    const changed = (_changes: unknown, area: string) => {
      if (area === "local" && mounted) void update();
    };
    browser.storage.onChanged.addListener(changed);
    return () => {
      mounted = false;
      browser.storage.onChanged.removeListener(changed);
    };
  }, [update]);
  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        (message as { type?: unknown }).type === "onshape-mitigator:toggle-menu"
      )
        setMenu((previous) => !previous);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number;
    async function refresh() {
      const documentPage = isDocumentPage();
      setDocumentPage(documentPage);
      const next = documentPage ? await readPage("state") : EMPTY_STATE;
      if (cancelled) return;
      setState((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      timer = window.setTimeout(refresh, 750);
    }
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);
  const toggleSketch = useCallback(() => {
    if (state.toolbarType !== "Sketch") return;
    void saveSetting(
      "sketchToolbarCollapsed",
      !settings.sketchToolbarCollapsed,
    ).catch(() => showToast("Could not save sketch panel preference"));
  }, [state.toolbarType, settings.sketchToolbarCollapsed]);
  const copy = useCallback(async () => {
    if (copyInFlight.current || !isDocumentPage()) return;
    copyInFlight.current = true;
    setCopying(true);
    try {
      await copyAiContextToClipboard({
        toolbarType: state.toolbarType,
        currentTool: state.currentTool,
      });
    } catch {
      showToast("Could not collect document context");
    } finally {
      copyInFlight.current = false;
      setCopying(false);
    }
  }, [state]);
  useEffect(() => {
    const actions: Record<ActionId, () => void> = {
      openExtensionMenu: () => setMenu((previous) => !previous),
      openVariablesTable: () => {
        if (!toggleVariablesTable())
          showToast("Variables table is unavailable on this page");
      },
      toggleSketchToolbar: toggleSketch,
      copyAiContext: () => void copy(),
      openSettings: () => setEditing(true),
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || editing) return;
      const path = event.composedPath();
      if (
        path.some(
          (node) =>
            node instanceof HTMLElement &&
            (node.matches("input,textarea,select") ||
              node.isContentEditable ||
              node.id === "onshape-extension-host"),
        )
      )
        return;
      for (const [id, binding] of Object.entries(settings.keyboardShortcuts)) {
        if (!binding || !matchesBinding(event, binding)) continue;
        if (!enabled && id !== "openExtensionMenu") return;
        if (
          !isDocumentPage() &&
          !["openExtensionMenu", "openSettings"].includes(id)
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        actions[id as ActionId]();
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [settings, enabled, editing, toggleSketch, copy]);
  useEffect(() => {
    if (menu) menuElement.current?.focus();
  }, [menu]);
  async function save(next: SettingsValue) {
    await browser.storage.local.set(next);
    setSettings(next);
  }
  return (
    <>
      {menu && (
        <section
          className="menu"
          aria-label="Onshape Mitigator menu"
          ref={menuElement}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" ||
              matchesBinding(
                event.nativeEvent,
                settings.keyboardShortcuts.openExtensionMenu,
              )
            ) {
              event.preventDefault();
              setMenu(false);
            }
          }}
        >
          <header>
            <strong>Onshape Mitigator</strong>
            <button aria-label="Hide menu" onClick={() => setMenu(false)}>
              ×
            </button>
          </header>
          {enabled && (
            <>
              <button
                disabled={!documentPage || copying}
                onClick={() => void copy()}
              >
                {copying ? "Copying context…" : "Copy context for AI"}
              </button>
              <button onClick={() => setEditing(true)}>Settings</button>
            </>
          )}
          <button
            onClick={() =>
              void saveSetting("extensionEnabled", !enabled).catch(() =>
                showToast("Could not change extension state"),
              )
            }
          >
            {enabled ? "Disable extension" : "Enable extension"}
          </button>
        </section>
      )}
      {enabled && editing && (
        <Settings
          settings={settings}
          save={save}
          close={() => setEditing(false)}
        />
      )}
      {enabled && documentPage && (
        <>
          <Tooltips />
          <SketchPanel
            state={state}
            collapsed={settings.sketchToolbarCollapsed}
            toggle={toggleSketch}
          />
        </>
      )}
    </>
  );
}
