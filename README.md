# Onshape Mitigator

A small Chrome and Edge extension that makes Onshape easier to learn and use.

- **Instant tooltips:** hovering an icon in Onshape's `s` shortcut menu immediately shows its command name.
- **Collapsible sketch panel:** collapse sketch options while leaving native finish/cancel controls available. The preference persists.
- **Configurable shortcuts:** includes toggling the variables table and spatial Alt+numpad view mappings.
- **AI-ready document context:** copy a Markdown snapshot of the document URL/IDs, names, toolbar/tool state, selections, visible labels, and native Part Studio feature/variable definitions suitable for reconstructing the model. Optionally open a configured chatbot.

## Install in Chrome or Edge

Requires Node 22.12+ or Node 24 and a current desktop Chrome or Edge.

```sh
pnpm install --frozen-lockfile
pnpm run build
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

Alt+numpad view mappings are configured separately by physical key, so they work with Num Lock on or off. Defaults use a spatial layout: `1` front, `2` bottom, `3` back, `4` left, `5` isometric, `6` right, and `8` top. Keys `0`, `7`, and `9` start unbound. Native `Shift+1` through `Shift+7` views are unchanged.

## Context sharing

Collection happens only after a copy action. The clipboard receives the full Markdown snapshot. ChatGPT is the default destination (`https://chatgpt.com/?q={context}`), with automatic opening enabled. You can change the HTTP/HTTPS URL or turn opening off. A URL containing `{context}` shares a URL-encoded snapshot with that website; URLs are capped at 6,000 characters by shortening context. Without the placeholder, paste the clipboard into the chatbot yourself.

Selections and toolbar state depend on Onshape's internal Angular services. The copy action also makes read-only same-origin requests for the current Part Studio's native feature and variable definitions; if those endpoints are unavailable, copying still includes reachable DOM and URL information and clearly marks the missing reconstruction data. Clipboard failure is reported and does not open the chatbot. No analytics, accounts, API keys, backend, or background document uploads are used.

## Updating

Rebuild the extension, reload it in the browser's extension management page, and reload open Onshape tabs. Keep the same unpacked path and extension ID to retain settings. A new extension ID starts with defaults because browser storage is isolated per extension.

## Development and verification

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run test:extension
pnpm run build
```

Browser tests require Chromium: `pnpm exec playwright install chromium`, or set `CHROME_PATH` to a system Chromium/Chrome executable. See [tests](tests/README.md) and [build and verification](docs/build-and-verify.md).

The architecture separates isolated content UI, a small local settings store, DOM helpers, and a narrow page-context adapter. Bridge requests are restricted to validated state/model reads, sketch-dimension visibility, and standard-view commands; no general command or broadcast endpoint is exposed. Initial state is read explicitly, then refreshed and updated by scoped Angular event listeners. DOM helpers work without bridge readiness.

## License and attribution

See [LICENSE](LICENSE) and [NOTICE](NOTICE) for licensing and attribution for reused code and command-label data.

Onshape Mitigator is an independent community project, unaffiliated with Onshape or PTC. Trademarks belong to their owners.
