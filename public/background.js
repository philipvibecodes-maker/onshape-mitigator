const ENABLED_TITLE = "Open Onshape Mitigator menu";
const DISABLED_TITLE = "Onshape Mitigator (disabled)";

function updateActionState(enabled) {
  return Promise.all([
    chrome.action.setBadgeText({ text: enabled ? "" : "OFF" }),
    chrome.action.setBadgeBackgroundColor({ color: enabled ? "#202124" : "#6b7280" }),
    chrome.action.setTitle({ title: enabled ? ENABLED_TITLE : DISABLED_TITLE }),
  ]);
}

void chrome.storage.local
  .get("extensionEnabled")
  .then(({ extensionEnabled }) => updateActionState(extensionEnabled !== false));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.extensionEnabled)
    void updateActionState(changes.extensionEnabled.newValue !== false);
});

// Toolbar clicks use the browser's icon-anchored popup. Keyboard requests use
// the same popup unless fullscreen hides the toolbar, or opening it fails.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.type !== "onshape-mitigator:open-menu" ||
    sender.tab?.windowId === undefined ||
    sender.tab.id === undefined
  ) return;
  const windowId = sender.tab.windowId;
  const tabId = sender.tab.id;
  const fallback = async () => ({
    opened: false,
    scale: 1 / await chrome.tabs.getZoom(tabId).catch(() => 1),
  });
  void (async () => {
    try {
      const window = await chrome.windows.get(windowId);
      if (window.state === "fullscreen" || message.pageFullscreen) return fallback();
      await chrome.action.openPopup({ windowId });
      return { opened: true };
    } catch {
      return fallback();
    }
  })().then(sendResponse);
  return true;
});
