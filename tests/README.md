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

E2E tests run **headless by default**, including the packaged extension test. For intentional visual debugging, opt into headed browser fixtures with `npm run test:e2e -- --headed --workers=1`. Keep the default headless for normal local runs and CI. Fixture artifacts go to `test-results/e2e/`; packaged extension artifacts go to `test-results/extension/`.

## Unit coverage

Settings migration preserves retained preferences, fills defaults, and ignores obsolete Rally actions. Tests cover exact shortcut modifiers and duplicate/malformed bindings, document URL references, partial Markdown context, Unicode-safe chatbot URL truncation, initial adapter state, unsupported requests, source/origin checks, correlated reply validation, and timeout cleanup.

## Browser fixtures

The browser suite uses production UI, styles, keyboard guard, and page adapter against a local Onshape-shaped fixture. Only extension storage/browser-action messaging and Onshape internals are simulated. Tests exercise immediate tooltips and replaced menus, initial sketch state without toolbar events, persistent collapse, native finish/cancel hit testing, moving dialogs, mode transitions, shortcut recording and cancellation, keyboard isolation, clipboard success/failure, chatbot settings, partial state, and document navigation.

## Packaged extension

The packaged test loads the unmodified `dist/` in Chrome for Testing and invokes its actual browser action through CDP. It verifies the native popup, real clipboard copying, opening settings in the correct tab, shortcut popup routing, browser/page fullscreen fallbacks, storage migration, tab isolation, absence of inherited theme/keypad effects, multi-tab disable/re-enable, disabled startup, and preference retention. It also checks unavailable actions outside Onshape. The test opts into Playwright's attachment to Chromium `other` targets because headless browser-action popups use that target type. Screenshots are written under `test-results/extension/`.

These checks do not log into live Onshape or establish live Chrome/Edge compatibility. The manual release checklist is in [Build and verify](../docs/build-and-verify.md).
