import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import { Menu } from "./components/Menu";
import { buildChatbotUrl, writeClipboard } from "./aiContext";
import { loadSettings, saveSetting } from "./storage";
import type { Settings } from "./types";
import "./styles.css";
import "./popup.css";

function Popup({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [tabId, setTabId] = useState<number>();
  const [available, setAvailable] = useState(false);
  const [documentPage, setDocumentPage] = useState(false);
  const [copying, setCopying] = useState<"topology" | "detailed" | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined) return;
        const reply = await browser.tabs.sendMessage(tab.id, {
          type: "onshape-mitigator:menu-state",
        }) as { documentPage?: boolean } | undefined;
        if (cancelled || typeof reply?.documentPage !== "boolean") return;
        setTabId(tab.id);
        setAvailable(true);
        setDocumentPage(reply.documentPage);
      } catch {
        if (!cancelled) setStatus("Open or reload an Onshape tab to use these tools.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function copy(mode: "topology" | "detailed" = "topology") {
    if (copying || tabId === undefined) return;
    setCopying(mode);
    try {
      const reply = await browser.tabs.sendMessage(tabId, {
        type: "onshape-mitigator:document-context",
        mode,
      }) as { markdown?: string } | undefined;
      if (typeof reply?.markdown !== "string") throw new Error();
      if (!(await writeClipboard(reply.markdown))) throw new Error();
      setStatus(
        mode === "detailed"
          ? "Detailed info copied for AI"
          : "Context copied for AI",
      );
      if (settings.aiOpenAfterCopy && settings.aiChatbotUrl) {
        const url = new URL(buildChatbotUrl(settings.aiChatbotUrl, reply.markdown));
        if (url.protocol === "http:" || url.protocol === "https:")
          await browser.tabs.create({ url: url.href });
      }
    } catch {
      setStatus(
        mode === "detailed"
          ? "Could not copy detailed info. Reload Onshape and try again."
          : "Could not copy document context. Reload Onshape and try again.",
      );
    } finally {
      setCopying(null);
    }
  }
  async function configure() {
    if (tabId === undefined) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: "onshape-mitigator:open-settings" });
      window.close();
    } catch {
      setStatus("Reload Onshape to open settings.");
    }
  }
  async function toggleEnabled() {
    try {
      const extensionEnabled = !settings.extensionEnabled;
      await saveSetting("extensionEnabled", extensionEnabled);
      setSettings({ ...settings, extensionEnabled });
      window.close();
    } catch {
      setStatus("Could not change extension state. Try again.");
    }
  }
  return <Menu
    popup
    enabled={settings.extensionEnabled}
    canCopy={documentPage}
    canConfigure={available}
    copying={copying}
    shortcut={settings.keyboardShortcuts.openExtensionMenu}
    status={status}
    close={() => window.close()}
    copy={() => void copy()}
    copyDetailed={() => void copy("detailed")}
    configure={() => void configure()}
    toggleEnabled={() => void toggleEnabled()}
  />;
}

void loadSettings().then((initial) => {
  createRoot(document.getElementById("root")!).render(<Popup initial={initial} />);
}).catch(() => {
  document.getElementById("root")!.textContent = "Could not load Onshape Mitigator. Reopen the menu to try again.";
});
