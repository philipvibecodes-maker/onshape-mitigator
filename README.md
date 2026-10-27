# Onshape Mitigator

A fork of [**Rally for Onshape**](https://github.com/RileyDavidson-Evans/onshape-plus) (MIT) — the open-source browser extension by Riley Davidson-Evans — with quality-of-life features aimed at making Onshape friendlier for newer and casual users:

* **Instant tooltips on the `s` shortcut menu** — hovering an icon in Onshape's mini-toolbar immediately shows the command name (no OS tooltip delay), plus tooltips on extension icons that previously had none. Stock Onshape leaves you guessing what unlabeled icons do, which makes learning the tools harder than it needs to be.
* **Collapsible sketch panel** — the sketch options dialog (`Sketch 1 …`) can be collapsed to just its title bar while keeping the finish/cancel buttons usable. On smaller screens the panel eats a real chunk of modeling space.
* **Configurable keyboard shortcuts** — including one for the Onshape variables table, which stock Onshape cannot bind.
* **One-click document context for AI assistants** — copies a Markdown snapshot of the current document state to the clipboard and optionally opens your chatbot of choice with the prompt pre-filled, so you can ask for help without describing your setup by hand.

Everything else — the floating pen sidebar, floating numeric keypad, smart floating actions, toolbar quick actions, canvas backgrounds, themes, fullscreen mode — comes from Rally for Onshape. See the [upstream repository](https://github.com/RileyDavidson-Evans/onshape-plus) and its [README](https://github.com/RileyDavidson-Evans/onshape-plus#readme) for the full feature set and documentation.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Telemetry](https://img.shields.io/badge/Telemetry-None-success)

---

## What's new in this fork

### Instant tooltips for the `s` shortcut menu

Onshape's mini-toolbar (the popup shown when you press `s`) renders its icons without any tooltip text. Onshape Mitigator watches the menu and shows a custom tooltip with the command name the instant you hover an icon — useful for quickly verifying you're about to click the right command. Extension-owned icons (numpad keys, CAD keyboard header buttons, radial-menu center button) also gained tooltips.

### Collapsible sketch panel

While editing a sketch, Onshape shows a persistent options panel (sketch plane, imprinting/constraints/expressions/errors checkboxes). Onshape Mitigator adds a chevron button to the panel's title bar that collapses everything below the header — the **✓ finish** and **✗ cancel** buttons remain visible and usable. The collapsed state is persisted across sessions.

### Configurable keyboard shortcuts

A new **Keyboard Shortcuts** section in the settings dialog lets you rebind extension actions by pressing the desired key combination (Backspace clears, Escape cancels).

Default bindings:

| Shortcut      | Action                                              |
| ------------- | --------------------------------------------------- |
| `Alt+V`       | Toggle the Onshape **variables table**              |
| `Alt+B`       | Collapse / expand the Onshape Mitigator sidebar     |
| `Alt+Shift+T` | Collapse / expand the sketch options panel          |
| `Alt+Shift+C` | Copy document context for AI (+ open chatbot)       |
| *(unbound)*   | Open extension settings                             |

`Alt+Shift+…` is used where Onshape already owns the plain `Alt` combination (e.g. `Alt+T` toggles the element panel, `Alt+C` opens command search).

### AI-ready document context

Clicking the **robot button** in the sidebar (or pressing `Alt+Shift+C`) collects a snapshot of the current document as Markdown:

* Document URL and IDs (document, workspace/version/microversion, element)
* Document and element names, current toolbar mode, active tool
* Whether a feature dialog is open
* Current selections (via Onshape's Angular selection service)
* Feature list and variable-table contents, where reachable in the DOM

The snapshot ends with a note telling the assistant you'll follow up with your actual question, then is copied to the clipboard and your configured chatbot opens in a new tab.

The **AI Assistant** settings section configures the chatbot URL and whether it opens automatically. If the URL contains `{context}`, the Markdown is URL-encoded into it — e.g. `https://chatgpt.com/?q={context}` sends the context as the first message (the follow-up note prevents premature answers). Without a placeholder, the chatbot opens and you paste with `Ctrl+V`.

> **Privacy note:** context collection is fully local and only happens when you trigger it. The only outbound action is opening the chatbot URL you configured — nothing is sent anywhere else.

---

## Installation

This fork is not published to a store — load it unpacked:

```bash
npm install
npm run build
```

Then in Chrome/Edge: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` directory. Open an Onshape document and the sidebar will appear.

For the published upstream extension, see the [Rally for Onshape Chrome Web Store listing](https://chromewebstore.google.com/detail/rally-for-onshape/hanbmgaepnkkmmgafdpfocnjhfccckoh).

---

## Development

```bash
npm install          # install dependencies
npm run build        # build the extension into dist/
npm run safari:build # build the Safari version
npm run safari:sync  # sync Safari assets
```

Built with React, TypeScript, Vite, Tailwind CSS, and Manifest V3. A page-context bridge (`public/onshape-page-bridge.js`) taps Onshape's AngularJS injector for selections, commands, and events; settings persist in `browser.storage.local`.

---

## Security & privacy

The extension runs locally in your browser: no telemetry, no analytics, no account required. Settings are stored only in browser extension storage. The AI-context feature collects document state solely on explicit user action and transmits it only by opening the chatbot URL you configured.

Upstream's security documentation still applies:

* [Security Policy](./SECURITY.md)
* [Security Overview](./docs/security-overview.md)
* [Build & Verify Guide](./docs/build-and-verify.md)

---

## Disclaimer

Onshape Mitigator is an independent community project and is not affiliated with, endorsed by, or sponsored by Onshape, PTC, or the Rally for Onshape project.

All trademarks are the property of their respective owners.

---

## License

Licensed under the MIT License, same as upstream.

Click the extension icon on an Onshape tab to show or hide the floating menu. The menu starts hidden. Choose **Disable extension** to turn off Onshape Mitigator on all Onshape tabs (open tabs reload). Click the extension icon again and choose **Enable extension** to turn it back on.
