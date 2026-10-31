import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import { App } from "./App";
import { loadSettings } from "./storage";
import uiCss from "./styles.css?inline";
import pageCss from "./page.css?inline";

async function start() {
  if (document.getElementById("onshape-extension-host")) return;
  const settings = await loadSettings();
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      changes.extensionEnabled &&
      changes.extensionEnabled.newValue !== settings.extensionEnabled
    )
      location.reload();
  });
  if (settings.extensionEnabled) {
    const script = document.createElement("script");
    script.id = "mitigator-page-adapter";
    script.src = browser.runtime.getURL("onshape-page-bridge.js");
    document.documentElement.append(script);
    const style = document.createElement("style");
    style.id = "mitigator-page-style";
    style.textContent = pageCss;
    document.documentElement.append(style);
  }
  const host = document.createElement("div");
  host.id = "onshape-extension-host";
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = uiCss;
  shadow.append(style);
  const root = document.createElement("div");
  shadow.append(root);
  createRoot(root).render(<App initial={settings} />);
}
void start().catch((error) =>
  console.error("Onshape Mitigator could not start", error),
);
