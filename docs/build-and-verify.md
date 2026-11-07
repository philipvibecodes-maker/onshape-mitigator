# Build and verify

```sh
git clone https://github.com/philipvibecodes-maker/onshape-mitigator.git
cd onshape-mitigator
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run test:extension
npm run build
```

Use Node 22.12+ or Node 24. Browser checks use Playwright Chromium or `CHROME_PATH`; install with `npx playwright install chromium` if necessary.

Inspect `dist/manifest.json`: Chromium Manifest V3, Onshape-only content scripts, storage/clipboardWrite permissions, and a service worker. The built adapter exposes only state/selection reads. No Firefox/Safari release packages or automatic store publishing are configured.

Load `dist/` unpacked through Chrome or Edge's extension management page and reload Onshape tabs. Keep the same unpacked path and extension ID to retain preferences across updates.

Check that the icon opens a dark browser popup attached to the icon, including when unpinned. `Alt+M` should open the same popup normally and a matching upper-right page menu in browser/page fullscreen. `Alt+S` opens settings by default. Check closing, clipboard copying, settings, and enable/disable through both surfaces; the disabled state should show an `OFF` badge on the browser action icon.

Before release, manually verify current Chrome and Edge against live Onshape: open an already-loaded Part Studio; hover the S menu; edit a sketch and collapse/expand its panel; use native finish/cancel; drag/resize the dialog; toggle variables; copy context with selections; configure chatbot opening; switch to Assembly and another document; disable/re-enable with multiple tabs. Verify native appearance and editing shortcuts. Automated fixtures cannot establish compatibility with current live Onshape internals.

## Reusable Chromium live-test setup

Use the Chromium helper for repeatable live checks. It loads the built `dist/`
extension, signs in through the saved `onshape.com` credential in the browser
password manager, and opens a real document without printing credentials:

```sh
ONSHAPE_DOCUMENT_URL='https://cad.onshape.com/documents/<document-id>/w/<workspace-id>/e/<element-id>' \
npm run test:live -- --headed --keep-open
```

On this workstation the helper automatically selects Flatpak Chromium, the current
user's saved Flatpak profile, desktop/keyring session values, and CDP port. It also
rejects a profile or port already in use and cleans up a kept-open browser on
Ctrl+C. Run `npm run test:live -- --help` for profile, executable, Flatpak, port,
and document-selection overrides. `ONSHAPE_DOCUMENT_NAME` selects a named document;
without either document selector, the first workspace document is used.
