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

Check that the icon opens a browser popup attached to the icon, including when unpinned. `Alt+M` should open the same popup normally and a matching upper-right page menu in browser/page fullscreen. Check closing, clipboard copying, settings, and enable/disable through both surfaces.

Before release, manually verify current Chrome and Edge against live Onshape: open an already-loaded Part Studio; hover the S menu; edit a sketch and collapse/expand its panel; use native finish/cancel; drag/resize the dialog; toggle variables; copy context with selections; configure chatbot opening; switch to Assembly and another document; disable/re-enable with multiple tabs. Verify native appearance and editing shortcuts. Automated fixtures cannot establish compatibility with current live Onshape internals.
