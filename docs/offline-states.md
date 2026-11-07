# Capture and replay Onshape states

Save a document's UI once, then test Mitigator changes locally or in CI without
an Onshape account. Each JSON file is one state, not a recording of a whole editing
session. Export several files while changing tools, selections, tabs, dialogs, or
panel positions to build a regression library.

## Capture a real document

1. Run `npm ci` and `npm run build`, then load/reload `dist/` as an unpacked extension.
2. Open an authorized Onshape document in your usual signed-in browser and reload
   the tab so it receives the current extension. Authentication is needed only
   when capturing new live states.
3. Put the document into the state you want to preserve. Open **Mitigator →
   Settings → Offline testing**.
4. Enter a descriptive **Test state name** (for example, `sketch-dialog-right-edge`)
   and **Expected behavior / steps**, then click **Save test state**.
5. Repeat for other states. Review the downloaded JSON before sharing or committing
   it: document IDs, names, visible text, selected entity IDs, features, and
   variables can contain private design information.

Export is explicit and local. There is no background recorder or upload service.
Scripts, event handlers, Angular directives, form values, comments, extension UI,
and remote assets are removed. Cookies, headers, browser storage, password-manager
data, and login sessions are never read. This is not a guarantee of anonymization:
document content and model JSON remain in the file.

## Replay and add states

```sh
npm ci
npm run states
```

Open `http://127.0.0.1:4173/tests/replay/` if the browser does not open automatically.
Choose **Open state JSON** to preview any downloaded capture. Or copy reviewed JSON
files into `tests/states/` (subdirectories are supported), then reload the viewer:
they appear in the saved-state list and are automatically discovered by the tests.
Use unique filenames and descriptive names. To replace a state, replace its file;
to remove one, delete its file. No generated manifest needs updating.

The viewer starts with clean Mitigator settings on every load. Refresh before
opening another capture. Back and Refresh return to the saved-state list. Replays
use the captured `viewport.width` and `viewport.height`, scaling down as needed to
keep the full recorded layout visible; automated tests use the exact dimensions.
Recorded toolbar labels are also exposed as basic hover tooltips in replay.

```sh
npx playwright install chromium
npm run test:states
# All browser tests, including saved states:
npm run test:e2e
```

Every JSON capture receives smoke checks for schema validation, recorded toolbar/
tool/selection/model data through the **production page adapter**, settings access,
and the sketch toggle when a sketch dialog is present. External browser requests
are blocked and fail the check. The suite also tests export → download → import →
collapse/expand. It runs in the existing CI job through `test:e2e`.

The prose in **Expected behavior / steps** is a manual checklist, not executable
assertions. Add a targeted Playwright scenario for a specific bug that needs more
than the generic smoke check. The common replay entry is `tests/replay/load.ts`;
each test should load the viewer in a fresh page and import its JSON using the
`#state-file` input. Extend the capture schema deliberately if new plugin reads
require new data; unsupported schema versions fail clearly instead of guessing.

## What is preserved

Version 1 captures include a name, notes, timestamp, title, document path, viewport
size, toolbar state/current tool, selection, available feature and variable API
responses, and sanitized DOM with inline computed layout/typography. Capture is
limited to 25,000 elements and 25 MB. A document navigation during capture aborts
the export. If the adapter or model endpoints are unavailable, the saved state is
partial; the export status reports an unavailable adapter, and null model fields
remain unavailable in replay.

The replay substitutes recorded Onshape services and model responses, then loads
the current production adapter and React UI with the existing extension-browser
mock. It strips active markup again at import and does not use Onshape credentials.
The local viewer requires installed development dependencies, but its replay does
not contact Onshape or load remote assets.

Canvas/WebGL pixels, exact camera pose, CAD geometry, live Angular behavior,
animations, pseudo-elements, shadow DOM, external fonts/icons/images, native
Onshape button actions, and dynamic editing are not recreated. This is a static
UI/context regression workflow, not an offline Onshape installation or a replacement
for live release verification. Do not use it to assert that native finish/cancel
actions actually modify a model.

The checked-in `onshape-*.json` files were captured from a real Onshape document
and reviewed before committing. They cover a Part Studio, an active sketch edit,
and an Assembly tab. Add further reviewed captures from your authenticated browser
using the steps above.
