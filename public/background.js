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
