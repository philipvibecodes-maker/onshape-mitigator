# Repository Guidelines

## Project Structure & Module Organization

Onshape Mitigator is a Chrome/Edge Manifest V3 extension built with React, TypeScript, and Vite. `src/main.tsx` mounts the UI in a shadow root; `src/App.tsx` coordinates settings and actions. UI components live in `src/components/`; `src/adapter/` contains DOM helpers and the page-context messaging protocol. Settings, shortcuts, and context copying live in `src/storage.ts`, `src/shortcuts.ts`, and `src/aiContext.ts`.

`public/` contains the manifest, service worker, keyboard guard, and icons. Tests live in `tests/unit/`, `tests/e2e/`, and `tests/extension/`, with browser fixtures in `tests/fixture/`. Build output goes to `dist/`; contributor and release documentation lives in `docs/`.

## Build, Test, and Development Commands

Use the Node version in `.nvmrc` and install dependencies with `npm ci`.

- `npm run dev`: start the Vite development server.
- `npm run build`: build the unpacked extension, page adapter, and license files.
- `npm run build:watch`: rebuild extension files during development.
- `npm run typecheck`: check TypeScript without emitting files.
- `npm test`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright browser fixtures.
- `npm run test:extension`: build and test the packaged extension.

Install browser binaries with `npx playwright install chromium`, or select a compatible executable through `CHROME_PATH`. Load `dist/` unpacked in Chrome/Edge and reload Onshape tabs after rebuilding.

E2E tests run headless by default. Preserve that default for normal local runs and CI. Use `npm run test:e2e -- --headed --workers=1` only for intentional visual debugging; a single worker avoids competing headed windows.

## Coding Style & Naming Conventions

Follow existing two-space indentation, double quotes, and semicolons. Use PascalCase for React components and types, camelCase for functions and variables, and uppercase names for shared constants. Keep TypeScript types explicit at adapter boundaries. No formatter or linter script is currently configured.

## Testing Guidelines

Use `*.test.tsx` for Vitest/JSDOM tests and `*.spec.ts` for Playwright scenarios. Cover changed behavior, especially settings migration, shortcut isolation, adapter validation, and native Onshape controls. CI runs typechecking and all three test suites; no numeric coverage threshold is configured. Follow `docs/build-and-verify.md` for live Chrome/Edge release checks; fixtures do not establish live Onshape compatibility.

## Commit & Pull Request Guidelines

History uses imperative, descriptive subjects, such as “Keep sketch collapse toggle clear of native controls.” Keep commits focused. PRs should explain the behavior change, link relevant issues, report validation and limitations, and include screenshots for visible UI changes.

## Agent Instructions

When `.codegraph/` exists, use `codegraph explore "<symbol or question>"` before locating or reading code. Do not initialize an index when absent.

Before declaring any implementation or bug-fix task complete, use `$onshape-browser-verify` at `/home/claude/.codex/skills/onshape-browser-verify/SKILL.md`. The skill describes Brave by default, but this environment's user preference is **Chromium**, using the user's Flatpak profile below. Honor that preference; do not substitute Brave, Chrome, or Chrome for Testing. Build and load the final extension, exercise the change in a live Onshape document, and report the observed result. Unit tests, fixtures, and a running debug endpoint do not satisfy this requirement. If live verification is blocked, report the specific blocker; documentation-only changes are exempt.

## Live Onshape verification with Chromium

Use the repository helper rather than launching Chromium manually. `npm run test:live` builds `dist/`, launches Chromium, attaches Playwright over CDP, signs in through the saved `onshape.com` credential if needed, and opens a requested document. It runs headless by default; for this user's live verification, use `--headed --keep-open` so the actual Chromium window and profile are in use.

The saved Chromium profile is the Flatpak profile at `/home/claude/.var/app/org.chromium.Chromium/config/chromium`. This is the **user-data directory**; its `Default/` subdirectory is the default profile. Set `ONSHAPE_PROFILE_DIR` to the parent directory shown above, not to `Default/`. A known-good headed invocation is:

```sh
XDG_RUNTIME_DIR=/run/user/1001 \
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
DISPLAY=:1 \
XAUTHORITY=/run/user/1001/gdm/Xauthority \
ONSHAPE_PROFILE_DIR=/home/claude/.var/app/org.chromium.Chromium/config/chromium \
CHROMIUM_FLATPAK_APP=org.chromium.Chromium \
ONSHAPE_DOCUMENT_URL='https://cad.onshape.com/documents/<document-id>/w/<workspace-id>/e/<element-id>' \
npm run test:live -- --headed --keep-open
```

Set `ONSHAPE_DOCUMENT_URL` to an authorized live document to avoid landing on the documents list or testing the wrong tab. `ONSHAPE_DOCUMENT_NAME` can select a document by its visible name when no URL is supplied. The helper uses CDP port `9224` by default; `CHROMIUM_DEBUG_PORT` can override it. Confirm startup with `curl --silent --show-error http://127.0.0.1:9224/json/version`, then verify the actual Onshape editor, extension service worker/host, and changed behavior. A debug endpoint alone is not a successful check.

The command runner uses `claude` (UID 1001) but may inherit stale desktop settings for `philip` (UID 1000). Check `id`, `loginctl list-sessions`, and only the relevant environment values before diagnosing display or keyring failures. Do not dump the full environment. Recheck values after desktop-session changes. Do not launch the same profile concurrently. A temporary or incorrect profile can show first-run Terms/onboarding pages and has no saved Onshape login; check the user-data path instead of setting up a substitute profile. If a browser hangs, inspect the process command line and stop only the Chromium process launched for this task (and any orphaned launcher process); verify port `9224` closes. `flatpak kill` alone may not release the task's nested Chromium process. Leave other Chromium windows and users' browser processes alone.

After a rebuild or extension reload, reload the target Onshape document tab so it receives the current content script. Profiles can restore multiple tabs for the same document; identify the active target before interacting and avoid leaving duplicate task-created tabs. Open the extension popup with its normal browser control or `Alt+M`, click **Copy context for AI**, and inspect the clipboard result without logging the full document contents. Confirm key section headings, readable JSON line breaks, and required fields using only aggregate checks or short non-sensitive excerpts.

The current viewport capture reads DOM state without screenshots: the canvas's `data-view-shown` orientation/preset, visible canvas bounds, and detected panel bounds. Onshape's exposed page state did not provide camera position/target/up vectors, projection/zoom, or face-level visibility. Do not claim the copied context identifies which model faces are visible or contains an exact camera pose unless a supported live interface is found and verified.

### Onshape sign-in and saved credentials

Reuse the authenticated Chromium profile when possible. The live helper opens `chrome://password-manager/passwords`, locates the saved `onshape.com` entry, and transfers its fields to Onshape's Email/Continue then Password/Sign in flow in memory. It does not hardcode the account name or password. If the entry is missing, the keyring is locked, or an unlock/MFA/CAPTCHA prompt requires user action, stop and request that specific help; do not bypass authentication. Do not conclude credentials are missing until the profile path and `claude` session environment are correct. A freshly restarted browser may need the sign-in flow again.

Never print or persist passwords, cookies, tokens, or password-manager contents in tool output, logs, screenshots, traces, reports, or repository files. Use the browser password-manager UI rather than credential databases. Hide the password again after any in-memory transfer, close the password-manager tab, and do not include document contents in verification logs.
