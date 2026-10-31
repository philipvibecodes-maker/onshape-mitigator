# Onshape Mitigator

A small standalone Chrome and Edge extension that makes Onshape easier to learn and use. It keeps four Mitigator features and replaces the former Rally-based application with a minimal extension shell.

- **Instant tooltips:** hovering an icon in Onshape's `s` shortcut menu immediately shows its command name.
- **Collapsible sketch panel:** collapse sketch options while leaving native finish/cancel controls available. The preference persists.
- **Configurable shortcuts:** includes toggling the variables table, which Onshape cannot normally bind.
- **AI-ready document context:** copy a Markdown snapshot of the document URL/IDs, names, toolbar/tool state, selections, and visible feature/variable lists. Optionally open a configured chatbot.

## Install in Chrome or Edge

Requires Node 22.12+ or Node 24 and a current desktop Chrome or Edge.

```sh
npm ci
npm run build
```

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/`. Reload existing Onshape tabs after installation or updating. This version is distributed unpacked; no store publishing is configured.

Click the browser extension icon to open a popup anchored to that icon. `Alt+M` opens the same popup when the toolbar is available. In browser or page fullscreen, the shortcut toggles a matching menu at the upper-right edge of the page; this also serves as a fallback if the browser cannot open its popup. Both menus provide **Copy context for AI**, **Settings**, and **Disable extension**. Settings opens in the Onshape tab. When disabled, the icon or menu shortcut still exposes **Enable extension**. Changing enabled state reloads open Onshape tabs.

The extension runs on `https://*.onshape.com/*`; modeling helpers activate on document pages. It leaves Onshape's theme, canvas, native shortcuts, and normal editing controls alone.

## Shortcuts and settings

| Default       | Action                                   |
| ------------- | ---------------------------------------- |
| `Alt+M`       | Toggle extension menu                    |
| `Alt+V`       | Toggle variables table                   |
| `Alt+Shift+T` | Collapse/expand sketch options           |
| `Alt+Shift+C` | Copy context and optionally open chatbot |
| Unbound       | Open settings                            |

In Settings, click a binding and press a new combination. Backspace clears; Escape cancels recording. Duplicate assignments are rejected. **Save settings** commits changes; Cancel discards them. Shortcuts do not fire while typing in Onshape fields or editing extension settings. Some browser/OS-reserved combinations cannot be overridden.

## Context sharing

Collection happens only after a copy action. The clipboard receives the full Markdown snapshot. ChatGPT is the default destination (`https://chatgpt.com/?q={context}`), with automatic opening enabled. You can change the HTTP/HTTPS URL or turn opening off. A URL containing `{context}` shares a URL-encoded snapshot with that website; URLs are capped at 6,000 characters by shortening context. Without the placeholder, paste the clipboard into the chatbot yourself.

Selections and toolbar state depend on Onshape's internal Angular services. If unavailable, copying still includes reachable DOM and URL information. Feature and variable lists include only rows accessible in the current DOM, not a complete model export. Clipboard failure is reported and does not open the chatbot. No analytics, accounts, API keys, backend, or background document uploads are used.

## Updating from the fork

When the browser retains the extension ID, the port migrates enabled state, retained shortcut bindings, sketch-collapse state, and chatbot settings. Sidebar-specific shortcuts and other Rally preferences are ignored. A new extension ID starts with defaults; browser storage is isolated per extension. There is no cross-installation settings transfer.

The pen sidebar, keypad, floating actions, themes, canvas backgrounds, and fullscreen helpers are no longer part of Mitigator. Firefox and Safari are deferred.

## Development and verification

```sh
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run test:extension
npm run build
```

Browser tests require Chromium: `npx playwright install chromium`, or set `CHROME_PATH` to a system Chromium/Chrome executable. See [tests](tests/README.md) and [build and verification](docs/build-and-verify.md).

The architecture separates isolated content UI, a small local settings store, DOM helpers, and a read-only page-context adapter. Bridge requests are restricted to state and selection reads; no general command or broadcast endpoint is exposed. Initial state is read explicitly, then refreshed and updated by scoped Angular event listeners. DOM helpers work without bridge readiness.

## Attribution and independence

The extension began as a fork of [Rally for Onshape](https://github.com/RileyDavidson-Evans/onshape-plus), by Riley Davidson-Evans. The standalone port selectively reuses MIT-licensed code and command-label data; it does not include or depend on the Rally application. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Onshape Mitigator is an independent community project, unaffiliated with Onshape, PTC, or Rally for Onshape. Trademarks belong to their owners.
