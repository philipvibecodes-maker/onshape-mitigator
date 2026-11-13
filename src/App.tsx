import { useCallback, useEffect, useRef, useState } from "react";
import browser from "webextension-polyfill";
import type {
  ActionId,
  NumpadCode,
  OnshapeState,
  Settings as SettingsValue,
} from "./types";
import { loadSettings, saveSetting } from "./storage";
import {
  EMPTY_STATE,
  executeStandardView,
  readPage,
  setSketchDimensionsHidden,
  toggleVariablesTable,
} from "./adapter/client";
import { isDocumentPage } from "./adapter/dom";
import { matchesBinding } from "./shortcuts";
import {
  collectContext,
  copyAiContextToClipboard,
  formatContextAsMarkdown,
  showToast,
} from "./aiContext";
import { Tooltips } from "./components/Tooltips";
import { SketchPanel } from "./components/SketchPanel";
import { Settings } from "./components/Settings";
import { Menu } from "./components/Menu";

export function App({ initial }: { initial: SettingsValue }) {
  const [settings, setSettings] = useState(initial);
  const [menu, setMenu] = useState(false);
  const [menuScale, setMenuScale] = useState(1);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<OnshapeState>(EMPTY_STATE);
  const [documentPage, setDocumentPage] = useState(isDocumentPage());
  const [copying, setCopying] = useState<"topology" | "detailed" | null>(null);
  const menuOpening = useRef(false);
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
      if (!message || typeof message !== "object") return;
      switch ((message as { type?: unknown }).type) {
        case "onshape-mitigator:toggle-menu":
          setMenu((previous) => !previous);
          break;
        case "onshape-mitigator:menu-state":
          setMenu(false);
          return Promise.resolve({ documentPage: isDocumentPage() });
        case "onshape-mitigator:open-settings":
          if (!enabled) return;
          setMenu(false);
          setEditing(true);
          return Promise.resolve({ opened: true });
        case "onshape-mitigator:document-context": {
          if (!enabled || !isDocumentPage()) return;
          const mode =
            (message as { mode?: unknown }).mode === "detailed"
              ? "detailed"
              : "topology";
          return collectContext(mode, {
            toolbarType: state.toolbarType,
            currentTool: state.currentTool,
          }).then((snapshot) => ({
            markdown: formatContextAsMarkdown(snapshot, { mode }),
          }));
        }
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [enabled, state]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number;
    async function refresh() {
      const documentPage = isDocumentPage();
      setDocumentPage(documentPage);
      const next = documentPage ? await readPage("state") : EMPTY_STATE;
      if (cancelled) return;
      if (next.toolbarType === "Sketch")
        setSketchDimensionsHidden(settings.sketchDimensionsHidden);
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
  }, [enabled, settings.sketchDimensionsHidden]);
  const toggleSketch = useCallback(() => {
    if (state.toolbarType !== "Sketch") return;
    void saveSetting(
      "sketchToolbarCollapsed",
      !settings.sketchToolbarCollapsed,
    ).catch(() => showToast("Could not save sketch panel preference"));
  }, [state.toolbarType, settings.sketchToolbarCollapsed]);
  const toggleDimensions = useCallback(() => {
    if (state.toolbarType !== "Sketch") return;
    const hidden = !settings.sketchDimensionsHidden;
    setSketchDimensionsHidden(hidden);
    setSettings((previous) => ({
      ...previous,
      sketchDimensionsHidden: hidden,
    }));
    void saveSetting("sketchDimensionsHidden", hidden).catch(() => {
      void update();
      showToast("Could not save dimension visibility preference");
    });
  }, [state.toolbarType, settings.sketchDimensionsHidden, update]);
  const copy = useCallback(async (mode: "topology" | "detailed" = "topology") => {
    if (copyInFlight.current || !isDocumentPage()) return;
    copyInFlight.current = true;
    setCopying(mode);
    try {
      await copyAiContextToClipboard({
        mode,
        toolbarType: state.toolbarType,
        currentTool: state.currentTool,
      });
    } catch {
      showToast("Could not collect document context");
    } finally {
      copyInFlight.current = false;
      setCopying(null);
    }
  }, [state]);
  const toggleMenu = useCallback(async () => {
    if (menu) {
      setMenu(false);
      return;
    }
    if (menuOpening.current) return;
    menuOpening.current = true;
    try {
      const reply = await browser.runtime.sendMessage({
        type: "onshape-mitigator:open-menu",
        pageFullscreen: !!document.fullscreenElement,
      }).catch(() => null) as { opened?: boolean; scale?: number } | null;
      if (reply?.opened) return;
      setMenuScale(
        typeof reply?.scale === "number" && Number.isFinite(reply.scale) && reply.scale > 0
          ? reply.scale
          : 1,
      );
      setMenu(true);
    } finally {
      menuOpening.current = false;
    }
  }, [menu]);
  useEffect(() => {
    const actions: Record<ActionId, () => void> = {
      openExtensionMenu: () => void toggleMenu(),
      openVariablesTable: () => {
        if (!toggleVariablesTable())
          showToast("Variables table is unavailable on this page");
      },
      toggleSketchToolbar: toggleSketch,
      toggleSketchDimensions: toggleDimensions,
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
      if (
        enabled &&
        event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.metaKey
      ) {
        const view =
          settings.numpadViewMappings[event.code as NumpadCode];
        if (view) {
          event.preventDefault();
          event.stopImmediatePropagation();
          executeStandardView(view);
          return;
        }
      }
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
  }, [
    settings,
    enabled,
    editing,
    toggleSketch,
    toggleDimensions,
    copy,
    toggleMenu,
  ]);
  async function save(next: SettingsValue) {
    await browser.storage.local.set(next);
    setSettings(next);
  }
  return (
    <>
      {menu && (
        <Menu
          scale={menuScale}
          enabled={enabled}
          canCopy={documentPage}
          copying={copying}
          shortcut={settings.keyboardShortcuts.openExtensionMenu}
          close={() => setMenu(false)}
          copy={() => void copy()}
          copyDetailed={() => void copy("detailed")}
          configure={() => setEditing(true)}
          toggleEnabled={() =>
            void saveSetting("extensionEnabled", !enabled).catch(() =>
              showToast("Could not change extension state"),
            )
          }
        />
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
            dimensionsHidden={settings.sketchDimensionsHidden}
            toggleDimensions={toggleDimensions}
          />
        </>
      )}
    </>
  );
}
