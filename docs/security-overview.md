# Security overview

The content script runs only on `https://*.onshape.com/*`. Toolbar clicks open an extension popup anchored by the browser to its icon. The fullscreen fallback menu and settings dialog render inside an extension-owned shadow root. Page-level styles are limited to an explicitly collapsed sketch dialog.

`storage` persists preferences; `clipboardWrite` allows user-triggered context copying. The background service worker opens the browser popup for menu shortcuts, falling back to the content menu when fullscreen hides the toolbar or the popup cannot open. The popup uses internal extension messaging to check the active Onshape tab, open settings there, and request context only after a Copy action. Clipboard writes happen in the focused popup. Enable/disable storage changes cause open Onshape content scripts to reload their pages. No additional permissions are required.

The adapter reads toolbar/tool state and explicitly requested selections through available Onshape Angular services. It uses scoped event subscriptions rather than replacing Angular broadcast/emit methods. No general command execution is accepted. Missing internal services yield partial data and do not stop DOM helpers. Correlation IDs, source/origin checks, response validation, and timeouts limit accidental cross-talk; page-origin code is not a trusted authentication boundary.

The only external sharing is optional chatbot opening after a successful, user-triggered clipboard copy. `{context}` in the URL explicitly includes document information. See the privacy policy for defaults and configuration.

Dependencies and code are bundled locally. No external fonts, background uploads, telemetry, or API credentials are required.
