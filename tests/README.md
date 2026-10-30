# Standalone extension checks

Run with Node 22.12+ or Node 24:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:e2e
npm run test:extension
```

Browser checks prefer Playwright's Chrome for Testing installation, then system Chrome/Chromium. Set `CHROME_PATH` to choose another executable. Managed system browsers may prohibit loading unpacked extensions; the packaged test needs a browser that allows development extensions and supports CDP `Extensions.loadUnpacked` and `Extensions.triggerAction`.

## Unit coverage

Settings migration preserves retained preferences, fills defaults, and ignores obsolete Rally actions. Tests cover exact shortcut modifiers and duplicate/malformed bindings, document URL references, partial Markdown context, Unicode-safe chatbot URL truncation, initial adapter state, unsupported requests, source/origin checks, correlated reply validation, and timeout cleanup.

## Browser fixtures

The browser suite uses production UI, styles, keyboard guard, and page adapter against a local Onshape-shaped fixture. Only extension storage/browser-action messaging and Onshape internals are simulated. Tests exercise immediate tooltips and replaced menus, initial sketch state without toolbar events, persistent collapse, native finish/cancel hit testing, moving dialogs, mode transitions, shortcut recording and cancellation, keyboard isolation, clipboard success/failure, chatbot settings, partial state, and document navigation.

## Packaged extension

The packaged test loads the unmodified `dist/` in Chrome for Testing and invokes its actual browser action through CDP. It verifies the service worker/content script message path, storage migration, initially hidden menus, tab isolation, absence of inherited theme/keypad effects, multi-tab disable/re-enable, disabled startup, and preference retention. Screenshots are written under `test-results/extension/`.

These checks do not log into live Onshape or establish live Chrome/Edge compatibility. The manual release checklist is in [Build and verify](../docs/build-and-verify.md).
