# Regression tests

These tests cover all five failures documented in
[PR #6](https://github.com/philipvibecodes-maker/onshape-mitigator/pull/6).

Run with Node 22.12+ (tested with Node 24):

```sh
npm ci
npm test
npm run test:e2e
npm run build
```

The browser tests use system Chrome at /usr/bin/google-chrome when available.
Otherwise, install Chromium with `npx playwright install chromium`.
Set `CHROME_PATH` to use another Chromium executable.

## Coverage and reproduction

The unit suite checks caret selection/boundaries, cancelled and stale focus frames,
unmount cleanup, collapse-control geometry, shadow keyboard isolation, cancellation
of edits, and browser editing transactions. Before fixes, the initial suite had
10 failures and four passing caret-boundary controls.

The Playwright suite loads the production entry point, components, styles, and
keyboard guard against local Onshape-style controls. Storage and Angular bridge
events are supplied by the fixture; no Onshape login or document changes are
needed. The guard loads before native capture listeners, matching its manifest
document_start registration.

Browser cases reproduce native Cancel interception, settings shortcut leakage,
both selected-text arrow failures, same-frame focus/blur, and missing Undo for
keypad insertion, backspace, and clear in inputs and textareas. These cases were
run and failed before the corresponding source fixes. Further checks cover
finish/cancel after collapse, settings Escape and Undo/Redo, and native text Redo.

The browser tests exercise actual DOM hit testing, shadow-root event retargeting,
and browser editing history. They do not validate against the live Onshape
application or browser extension packaging. JSDOM cannot reproduce native Undo;
the unit suite checks editing-command delegation and Playwright checks history.


## Packaged extension menu test

Run `npm run test:extension` with a recent system Chrome (or set `CHROME_PATH`).
This builds and installs the unmodified extension in a temporary Chrome profile.
It invokes the browser action through CDP `Extensions.triggerAction`, exercising
Chrome's real icon-click event, background worker, messaging, content scripts,
and persistent storage. Only the Onshape document and its bridge events are
fixtures; this test does not log into live Onshape.

Coverage includes menu visibility and repeated toggling, keypad overlap, tab
isolation, disabling and re-enabling across multiple open tabs, disabled startup
in a new tab, persistence after reload, and retention of user preferences.
Screenshots are written to `test-results/extension/`.
