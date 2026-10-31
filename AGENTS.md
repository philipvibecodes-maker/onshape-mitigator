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

## Brave Testing in This Environment

The command runner uses `claude` (UID 1001), but may inherit stale desktop settings for `philip` (UID 1000). A display authorization error does not mean headed Brave is unavailable. Check `id`, `loginctl list-sessions`, and the current user's session environment before drawing conclusions. Retrieve display settings without dumping unrelated environment variables:

```sh
XDG_RUNTIME_DIR=/run/user/1001 \
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
systemctl --user show-environment | rg '^(DISPLAY|XAUTHORITY)='
```

The following headed launch worked in this session; recheck these values after session changes:

```sh
DISPLAY=:1 \
XAUTHORITY=/run/user/1001/gdm/Xauthority \
XDG_RUNTIME_DIR=/run/user/1001 \
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus \
brave-browser \
  --user-data-dir=/home/claude/.config/BraveSoftware/Brave-Browser \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 https://cad.onshape.com
```

For headless testing, add `--headless=new`; it does not require desktop display authorization. Select the intended profile explicitly and avoid opening the same profile concurrently. The default `claude` Brave profile contains a saved Onshape login; see the sign-in notes below. `/home/claude/.config/onshape-debug-profile` did not provide an authenticated session during testing.

Verify debugging with `curl --silent --show-error http://127.0.0.1:9222/json/version`. A running debug endpoint alone does not establish Onshape login or extension functionality. When stopping test browsers, terminate only the instances started for the task, including their actual Brave processes rather than just launcher shells. Verify their debugging ports close; leave other users' browsers alone.

### Signing into Onshape

Verified on 2026-10-30: the saved login in `/home/claude/.config/BraveSoftware/Brave-Browser` worked when headed Brave used `claude`'s correct display, runtime directory, and session bus. Earlier launches with the inherited UID 1000 settings showed an empty password manager. Do not conclude that credentials are missing until the profile and desktop/keyring session settings are correct.

1. Launch Brave with the session settings above and open `https://cad.onshape.com`. Reuse an authenticated session if available.
2. If sign-in is required, check `brave://password-manager/passwords` for the `onshape.com` entry. Onshape uses an Email/Continue step followed by Password/Sign in.
3. Autofill through focus plus ArrowDown/Enter did not work in this session. With user authorization to use the saved login, the working fallback was to open the entry in Brave Password Manager, use Show password, transfer the saved value directly into Onshape's password field in memory, hide the password again, and submit Sign in. Obtain the account identifier from the saved entry; do not hardcode credentials in scripts.
4. Verify success by reaching the documents page with the signed-in account menu and document list, then opening a live document. Close the password-manager tab afterward.

Never print or persist passwords, cookies, tokens, or password-manager contents in logs, screenshots, reports, or repository files. Use the browser's password-manager UI rather than reading credential databases. If an unlock prompt requires user interaction, let the user complete it.
