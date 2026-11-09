# Implementation plan: sketch-scoped AI context

## Audience and objective

This plan is written for Luna Medium. Implement the smallest change that makes **Copy context for AI** sketch-aware:

- When the user is actively editing a sketch, copy only that sketch's context and native definition.
- When the user is not editing a sketch, preserve the current document-context behavior.
- Apply the same behavior to all entry points: the in-page menu, the keyboard shortcut, and the browser-action popup.
- Never fall back to copying the complete Part Studio when the UI says the user is in a sketch but the active sketch cannot be identified.

Do not add a setting or a second copy command. The behavior should follow the current editor state automatically.

## Confirmed current behavior

The existing flow is:

1. `App.copy` and the `onshape-mitigator:document-context` message handler pass `state.toolbarType` and `state.currentTool` into `collectAiContext`.
2. `collectAiContext` always reads selections and calls `readPage("model")`.
3. The page adapter fetches both `/features` and `/variables` for the active Part Studio.
4. `formatContextAsMarkdown` emits the DOM feature list, visible variables, all native feature definitions, and all native variable definitions.
5. The browser-action popup asks the content script for the same formatted Markdown, so the popup does not need its own scoping logic.

Relevant files:

- `src/App.tsx`: supplies the current toolbar mode and routes both copy entry points.
- `src/aiContext.ts`: collects the snapshot, compacts native definitions, and formats Markdown.
- `src/adapter/page.ts`: fetches the native Part Studio feature and variable responses.
- `src/types.ts`: defines `ModelData` and `OnshapeState`.
- `tests/unit/core.test.tsx`: unit coverage for context formatting and adapter validation.
- `tests/e2e/standalone.spec.ts`: fixture-level copy behavior.
- `tests/extension/menu.spec.ts`: packaged-extension popup copy behavior.
- `tests/fixture/index.html`: simulated Onshape toolbar, feature tree, selection service, and model endpoints.

## Verified Onshape identifiers

Use the feature ID exposed by the feature tree. Do not identify a sketch by its displayed name because names are editable and need not be unique.

A live Chromium check against Onshape on 2026-11-09 established the following while editing an existing sketch:

- The feature dialog is `#feature-dialog[feature-type="newSketch"]`.
- The active feature-tree row is under `#feature-list`, has class `edited`, and exposes `feature-id="..."` and `feature-type="newSketch"`.
- The native `/features` response has a top-level `features` array.
- In the response currently returned to the browser, each feature is wrapped as `{ type, typeName, message }`; the matching sketch ID, name, `featureType`, entities, constraints, and parameters are in `message`.
- The official API documentation also shows a flat feature representation. The matching helper should tolerate both wrapped and flat shapes.

Official feature-response reference: <https://onshape-public.github.io/docs/api-adv/featureaccess/>

## Required semantics

Treat a copy as sketch-scoped when either condition is true at collection time:

- the supplied `toolbarType` is `"Sketch"`; or
- `#feature-dialog[feature-type="newSketch"]` is present.

The DOM check covers a short state-polling delay after the user enters a sketch. The toolbar check makes the transition fail closed when the toolbar state still says `Sketch` for a moment after the identifying DOM nodes disappear.

### Document scope

Outside a sketch, keep the current snapshot and Markdown output unchanged. Existing document-context tests should continue to pass with only fixture updates needed to make the native response realistic.

### Sketch scope

Inside a sketch, the copied Markdown may contain:

- the source URL and document/workspace/element IDs;
- document and active-element names, solely to identify the source;
- workspace mode (`Sketch`), active sketch tool, and whether the sketch dialog is open;
- the active sketch's feature ID and name;
- current selections only when their classified kind is `sketch` or `sketch-entity`;
- the active sketch's native feature definition, including its plane/reference parameters, entities, constraints, suppression state, and subfeatures.

It must omit:

- every other native feature definition;
- native variable definitions;
- the DOM-derived full feature list and variables table;
- non-sketch selections such as faces, edges, bodies, and unrelated features;
- viewport and panel details, because they describe the wider document UI rather than the sketch;
- wording that claims the payload contains the entire Part Studio history.

Keeping the document locator is intentional: it identifies where the sketch came from without including other model content.

If sketch mode is active but the row, feature ID, native feature response, or matching sketch definition is unavailable, emit a sketch-scoped payload with a clear `Active sketch definition unavailable` message. Do not emit the complete feature response, variable response, DOM feature list, or variables table as a fallback.

## Data model changes

In `src/aiContext.ts`, make the snapshot scope explicit so later formatter changes cannot accidentally leak document data into sketch output. Prefer a discriminated union over optional fields scattered through one broad type.

Use a shape equivalent to:

```ts
type ContextSource = {
  capturedAt: string;
  url: string;
  ids: OnshapeDocumentIds;
  documentTitle: string;
  documentName: string | null;
  elementName: string | null;
  toolbarType: OnshapeToolbarMode | null;
  currentTool: string | null;
  featureDialogOpen: boolean;
};

type DocumentContextSnapshot = ContextSource & {
  scope: "document";
  selections: ClassifiedOnshapeSelection[];
  features: string[];
  variables: string[];
  model: ModelData;
  viewport: ViewportContext;
};

type SketchContextSnapshot = ContextSource & {
  scope: "sketch";
  selections: ClassifiedOnshapeSelection[];
  sketch: {
    featureId: string | null;
    name: string | null;
    definition: unknown | null;
  };
};

export type AiContextSnapshot =
  | DocumentContextSnapshot
  | SketchContextSnapshot;
```

Names may differ, but retain the `scope` discriminator and ensure the sketch variant has no `model`, `features`, `variables`, or `viewport` property. This is the main defense against accidentally formatting the full model.

No settings migration is required. The adapter protocol and `ModelData` can remain unchanged for this task.

## Implementation steps

### 1. Add pure sketch-identification helpers

In `src/aiContext.ts`, add small helpers with single responsibilities:

1. `getActiveSketchIdentity()` reads the live DOM.
   - Require `#feature-dialog[feature-type="newSketch"]`.
   - Find `#feature-list .edited[feature-id][feature-type="newSketch"]`.
   - Trim and validate `feature-id`; an empty value is unavailable.
   - Read the name from the row's label/text, or the feature-dialog title as a secondary display-only source.
   - Return `{ featureId, name }` or `null`.
   - Do not use `.selected` without `.edited`, because selection alone does not prove that the feature is being edited.

2. `unwrapFeature(value)` accepts either the browser's wrapped `{ message: ... }` form or the flat API form and returns the feature record when possible.

3. `findSketchDefinition(featuresResponse, featureId)`:
   - require an object with a top-level `features` array;
   - unwrap each entry;
   - match exact `featureId` string equality;
   - also require `featureType === "newSketch"`, `typeName === "BTMSketch"`, or the equivalent flat `btType` sketch marker;
   - return only the matching original feature entry, not the containing response;
   - return `null` on malformed data, ambiguous matches, a wrong feature type, or no match.

Export the pure matching helper if needed for focused unit tests. Do not export DOM internals solely for testing.

### 2. Branch collection before constructing the snapshot

Update `collectAiContext` in `src/aiContext.ts`:

1. Capture shared source fields once.
2. Read the active sketch identity before asynchronous model reads so the ID corresponds to the editor state at click time.
3. Determine scope using the toolbar-or-dialog rule above.
4. Continue reading selections once in either scope.
5. In document scope, retain the existing model, DOM feature list, variables, and viewport collection.
6. In sketch scope:
   - read the native model response;
   - find the exact matching sketch definition;
   - filter selections to `kind === "sketch"` or `kind === "sketch-entity"`;
   - return only the sketch snapshot variant;
   - never attach the full native response to the returned snapshot.

The existing `readPage("model")` fetches variables as well as features. It is acceptable to leave that adapter request unchanged for this implementation because the requirement concerns copied output, and avoiding a protocol change reduces risk. The full response must be discarded before the snapshot is returned. A later optimization may add a feature-only adapter read.

Handle editor races deliberately:

- If `toolbarType` says `Sketch` but no active row is found, return sketch scope with null identity/definition.
- If the DOM identifies a sketch while `toolbarType` has not refreshed yet, return sketch scope and use the DOM identity.
- If the feature response contains the ID on a non-sketch feature, treat it as unavailable.
- Never fall back to matching by name or array position.

### 3. Split Markdown formatting by scope

Refactor `formatContextAsMarkdown` into shared source formatting plus two explicit branches.

Document branch:

- Preserve the current `# Onshape Context` output and section order.
- Preserve current compaction behavior for the complete native model.

Sketch branch:

- Start with `# Onshape Sketch Context`.
- Include a minimal `## Source` section for URL, names, and IDs.
- Include a `## Current sketch` section with mode, active tool, feature ID, and sketch name.
- Include `## Current sketch selection` only for the already-filtered sketch/sketch-entity selections. Use the existing unavailable wording when empty.
- Include `## Native sketch definition` with one JSON code block containing the compacted matching definition.
- If the definition is null, include `- Active sketch definition unavailable.` and no JSON block.
- End with wording referring to the current sketch rather than the current document.

Call `compactModelDefinition` on the isolated definition. Confirm that the output retains sketch entities and constraints while still removing known annotation-only fields and metadata. Do not pass the full features response into this function in sketch scope.

### 4. Keep all entry points on the shared path

No new branching should be needed in `src/popup.tsx` or `public/background.js`.

Verify that both paths still call the same collector/formatter:

- In-page menu and shortcut: `copyAiContextToClipboard` -> `collectAiContext` -> `formatContextAsMarkdown`.
- Browser popup: `onshape-mitigator:document-context` in `App.tsx` -> the same collector and formatter.

Avoid duplicating sketch detection in React state or the popup. The decision must happen at collection time so it reflects the editor state when the user clicks Copy.

### 5. Make the fixture model realistic

Update `tests/fixture/index.html`:

- Mark the fixture's sketch row with `class="feature-list-item edited"`, `feature-id="sketch-1"`, and `feature-type="newSketch"` when `fixtureMode` is `Sketch`.
- Give `#feature-dialog` `feature-type="newSketch"` in sketch mode.
- Return a realistic wrapped `/features` response containing at least:
  - `Sketch 1`, feature ID `sketch-1`, feature type `newSketch`, one entity, and one constraint;
  - a second feature named with an unmistakable sentinel such as `DO NOT COPY Extrude`, containing another sentinel value.
- Return a separate `/variables` response containing a sentinel such as `DO_NOT_COPY_VARIABLE`.
- Preserve the ability to run the fixture in `Part Studio` mode so document-scope behavior can be checked.

Do not rely on endpoint URLs or names as the only assertion. Sentinel content makes accidental leakage obvious.

## Test plan

The implementation is incomplete until all cases below are automated.

### Unit tests in `tests/unit/core.test.tsx`

Add focused tests for the pure feature matcher:

1. Finds the requested sketch in the wrapped `{ typeName, message }` response used by the live browser.
2. Finds the requested sketch in the flat representation shown by the official API documentation.
3. Returns null for a missing feature ID.
4. Returns null when the ID belongs to a non-sketch feature.
5. Returns null for malformed responses and duplicate matching IDs.

Add formatter tests:

1. A document-scope snapshot preserves the existing headings and full reconstruction-data behavior.
2. A sketch-scope snapshot includes the active sketch ID, name, entity, and constraint.
3. A sketch-scope snapshot does not contain sentinel data placed in document features, variables, viewport fields, or non-sketch selections.
4. A sketch-scope snapshot with a null definition says it is unavailable and contains no native JSON from another feature.

Use object literals typed as `AiContextSnapshot` so TypeScript enforces the discriminated variants.

### Fixture E2E tests in `tests/e2e/standalone.spec.ts`

Replace the current sketch-mode expectation that copied output contains the full reconstruction data with explicit scope assertions:

- In sketch mode, copy through the in-page menu.
- Assert the output starts with `# Onshape Sketch Context`.
- Assert it contains `Sketch 1`, `sketch-1`, the sketch entity, and the sketch constraint.
- Assert it does not contain `DO NOT COPY Extrude`, `DO_NOT_COPY_VARIABLE`, `## Feature list`, `## Variables`, or `### Native variable definitions`.
- Assert the fixture's selected face is absent because it is not a sketch selection.
- Retain the checks that collection occurs only after the copy action and chatbot-opening preferences are honored.

Add or extend a Part Studio-mode case:

- Emit/switch to `Part Studio` and ensure the sketch dialog/edited marker are absent.
- Copy again.
- Assert the output uses `# Onshape Context` and still includes the full document feature and variable sentinels. This protects the unchanged outside-sketch behavior.

Add a fail-closed case:

- Keep toolbar mode `Sketch` but remove the edited row or change its ID so no native definition matches.
- Copy.
- Assert the output says `Active sketch definition unavailable` and contains none of the other feature or variable sentinels.

### Packaged extension test in `tests/extension/menu.spec.ts`

The packaged fixture starts in sketch mode and copies through the native popup. Update its paste assertion from `# Onshape Context` to `# Onshape Sketch Context`, then assert the pasted text includes the active sketch sentinel and excludes the other-feature and variable sentinels. This proves the browser-action path uses the same scope logic in the built extension.

## Verification commands

Use the pnpm commands from the migration branch:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run test:extension
pnpm run build
```

Then perform the repository-required live check:

```sh
pnpm run test:live -- --headed --keep-open
```

In the live document:

1. Outside a sketch, copy context and confirm the normal document-scoped sections remain.
2. Edit a sketch that is not the only feature in the Part Studio.
3. Copy through the in-page menu and confirm the payload identifies that sketch and includes its entities/constraints.
4. Confirm no other feature definitions, document variables, full feature list, or non-sketch selections are present.
5. Copy through the native browser popup and confirm the same scope.
6. Cancel or finish the sketch, wait for the toolbar to return to Part Studio, and confirm copying returns to document scope.
7. If possible, briefly test a newly created unsaved sketch. If Onshape does not expose a feature ID yet, confirm the copy fails closed with the unavailable message instead of exposing the whole model.

Do not print or persist the full live copied context. Report only whether expected sections were present or absent.

## Acceptance criteria

The work is complete when all of the following are true:

- Every copy entry point produces sketch-scoped Markdown while a sketch is being edited.
- The active sketch is selected by exact feature ID, never by name or position.
- Sketch output contains exactly one native sketch definition and no native variable definitions.
- Sketch output contains no other feature, DOM feature-list, DOM variable-table, viewport, or non-sketch selection data.
- Missing or mismatched active-sketch data fails closed and never emits the full model.
- Copying outside a sketch remains behaviorally unchanged.
- Unit, fixture E2E, packaged-extension, typecheck, and build checks pass.
- Live Chromium verification demonstrates both sketch scope and the return to document scope.

## Likely pitfalls

- `compactModelDefinition` currently mutates feature parameter arrays through `compactFeatureParameters`. Pass only the isolated sketch definition in sketch scope; do not compact the full response first and then filter it.
- Toolbar state is polled, so it can lag the DOM briefly. Apply the toolbar-or-dialog scope rule and fail closed during disagreement.
- The feature dialog alone proves sketch editing but does not supply a stable ID. Require the `.edited` feature row for matching.
- A selected feature-tree row is not necessarily being edited. Require `.edited`, not merely `.selected`.
- Feature names are not unique. Never use the dialog title as the native-definition key.
- Keep the scope decision in `collectAiContext`; branching only in the formatter would leave the complete model attached to a sketch snapshot and make future leaks easier.
- Do not weaken the page-message validators or add a general-purpose adapter endpoint. The existing narrow `model` read is sufficient.
