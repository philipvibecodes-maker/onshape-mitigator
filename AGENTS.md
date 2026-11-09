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

Before declaring any implementation or bug-fix task complete, use the repository Chromium login and live-test helper described below. Build and load the final extension, exercise the change in a live Onshape document, and report the observed result. Unit tests, fixtures, and a running debug endpoint do not satisfy this requirement. If live verification is blocked, report the specific blocker; documentation-only changes are exempt.

## Live Onshape verification with Chromium

Use the repository helper rather than launching Chromium manually. It supplies this
environment's Flatpak Chromium, profile, desktop-session, keyring, CDP, login, and
cleanup defaults. Select an authorized document and run:

```sh
ONSHAPE_DOCUMENT_URL='https://cad.onshape.com/documents/<document-id>/w/<workspace-id>/e/<element-id>' \
npm run test:live -- --headed --keep-open
```

Use `ONSHAPE_DOCUMENT_NAME` when selecting by visible name, and run
`npm run test:live -- --help` for supported overrides. Do not launch the same
profile concurrently or bypass the helper's profile/port conflict checks. If an
unlock, MFA, or CAPTCHA prompt appears, request user help. Never print or persist
passwords, cookies, tokens, password-manager contents, or full copied document
contents. Stop only browser processes created for the task.

Successful startup is not verification. Observe the real editor and canvas, the
extension host/service worker, and the changed behavior through normal browser
controls. Reload the document after rebuilding so it receives the current content
script. Fixtures and a listening CDP endpoint do not satisfy the live check.

The current viewport capture reads DOM state without screenshots: the canvas's `data-view-shown` orientation/preset, visible canvas bounds, and detected panel bounds. Onshape's exposed page state did not provide camera position/target/up vectors, projection/zoom, or face-level visibility. Do not claim the copied context identifies which model faces are visible or contains an exact camera pose unless a supported live interface is found and verified.
