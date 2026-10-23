# Onshape Mitigator comparative bug audit

Status: complete. Investigated from 2026-10-23 06:39:34 UTC to 2026-10-23 07:10:01 UTC (30 minutes 27 seconds).

## Environment and method

- Stock Onshape: Chrome, CDP port 8222, document **Chrome Document**.
- Extension enabled: Brave, CDP port 9222, document **Brave Document**.
- Baseline: repository commit `2c73ddf241fad68b26ff5600b51557b72985909d`, plus the local canvas z-index fix tested earlier in this session. That source fix and the existing package-file changes are **not included in this findings-only PR**. The automatic-dimension pass below describes the locally patched build, not unmodified `main`.
- Used Playwright over CDP, native DOM hit tests, real keyboard and mouse input, screenshots, and targeted timing tests.
- Saved the original extension preferences before testing. Settings changes and temporary sketches are restored/discarded at cleanup.
- No extension source changes made during this audit.

## Findings at a glance

| Finding | Priority | Conditions |
| --- | --- | --- |
| Sketch collapse control blocks native Cancel | High | Editing a sketch; default settings |
| Settings text entry activates sketch tools | High | Editing a sketch; focused extension text input |
| Keypad arrows mishandle selected text | Medium | Optional keypad enabled |
| Keypad focus/blur race leaves a ghost keypad | Low | Optional keypad; controlled short focus duration |
| Keypad edits bypass native text Undo | Medium | Optional keypad enabled |

## Confirmed findings

### 1. The sketch collapse control blocks Onshape's Cancel button

Priority: high. Applies with default settings while editing a sketch; does not require the optional keypad.

Reproduction:

1. Edit a sketch in Brave.
2. Click the native red Cancel button at the right end of the sketch dialog header.
3. The sketch remains open and the extension collapses the sketch panel instead.

Stock comparison: the same native Cancel control in Chrome is actionable. Playwright's actionability check succeeds in Chrome and fails in Brave because the extension host intercepts pointer events. A real click at the native Cancel button center changes `sketchToolbarCollapsed` to true.

Cause: [src/components/SketchToolbarCollapser/index.tsx:88–90](../../../src/components/SketchToolbarCollapser/index.tsx#L88-L90) positions a 24px collapse button at `header.right - 26`, directly over the native 28px Cancel control. The extension button has a higher stacking order. The README's promise that finish/cancel remain usable does not hold.

Suggested correction: reserve separate space for the collapse control alongside the native buttons; do not overlay either button.

Evidence: [stock-sketch-header.png](stock-sketch-header.png), [extension-sketch-header.png](extension-sketch-header.png); observations named "Sketch cancel button hit test", "Native cancel control actionability", and "Click native cancel location".

Same-browser control: disabled the extension temporarily in Brave, reloaded, and reopened Sketch 4. The native Cancel control became clickable and hit-tested to its own SVG. Re-enabled the extension afterward. Evidence: [brave-extension-disabled-cancel.png](brave-extension-disabled-cancel.png).

### 2. Typing into extension settings activates native sketch commands

Priority: high. Confirmed while a sketch is active.

Reproduction:

1. Edit a sketch in Brave.
2. Open extension settings, expand AI Assistant, and focus Chatbot URL.
3. Type `l` or `d`.
4. The letters do not enter the URL; Onshape activates LINESEGMENT or DIMENSION behind the settings modal.

Control: typing `lsd` into Chrome's native feature filter produces `lsd` and does not activate sketch tools. Ordinary letters tested outside sketch mode can enter the extension field normally; the effect depends on native shortcuts available in the current mode.

Cause: extension settings live inside an open shadow root. Native listeners outside it see `event.target` as `#onshape-extension-host`, although `event.composedPath()[0]` is the focused input. The extension does not isolate those keyboard events from Onshape. [src/components/KeyboardShortcuts/index.tsx:58–60](../../../src/components/KeyboardShortcuts/index.tsx#L58-L60) recognizes extension-originated events but simply returns, allowing native handlers to receive them.

Suggested correction: isolate keyboard events originating in editable extension controls from the native shortcut handlers, using the composed event path and preserving normal input behavior. Verify capture-phase ordering rather than assuming a React bubbling handler is sufficient.

Evidence: [extension-settings-keyboard-leak.png](extension-settings-keyboard-leak.png); observations "Typing native shortcut letters in extension URL field" and "Shadow input key leakage".

### 3. Keypad arrows move the caret incorrectly when text is selected

Priority: medium. Requires floating keypad mode Always, or Auto on supported touch devices.

Reproduction on a native Onshape text input:

1. Enter `12345` and select `234` (selection range `[1,4]`).
2. Press the extension keypad's Right arrow, then its `9` key.
3. Result: `129345`.

Stock comparison: hardware Right Arrow followed by `9` produces `123495`. The native arrow collapses the selection to its end (index 4); the keypad moves to index 2. Left Arrow is also wrong: stock collapses to index 1, keypad moves to index 0.

Cause: [src/components/floating-cad-keyboard/useFloatingCadKeyboard.ts:179–192](../../../src/components/floating-cad-keyboard/useFloatingCadKeyboard.ts#L179-L192) bases both directions on `selectionStart` and immediately adds/subtracts one, ignoring `selectionEnd` and the special behavior of an existing selection.

Suggested correction: collapse a nonempty selection to its start/end for Left/Right respectively. Move one character only when the selection is already collapsed.

Evidence: observations "Native vs keypad Right with selected text", "Native vs keypad Left with selected text", and "Selected-text ArrowRight then insert 9 changes result".

### 4. A short-lived native input can leave a ghost keypad

Priority: low; timing-dependent, demonstrated with controlled native focus/blur calls rather than a consistently reproduced ordinary mouse workflow. Requires the optional keypad.

Reproduction:

1. Set floating keypad to Always.
2. Focus a native Onshape input and blur it in the same frame.
3. After the next animation frame the keypad is visible despite `document.activeElement` being BODY.

Timing matrix: 5/5 ghost keypads with same-call focus/blur, 5/5 at 1ms, 1/5 at 5ms, 0/5 at 10/20/40ms.

Cause: [src/components/floating-cad-keyboard/useFloatingCadKeyboard.ts:56–73](../../../src/components/floating-cad-keyboard/useFloatingCadKeyboard.ts#L56-L73) schedules `setIsVisible(true)` in requestAnimationFrame without canceling it or checking that the input is still focused/connected. Focusout calls hideKeyboard first, then the pending frame shows it again.

Suggested correction: cancel the pending animation frame on blur/unmount and validate current focus before displaying the keypad.

Evidence: [keypad-after-native-blur.png](keypad-after-native-blur.png); observations "Immediate native input focus and blur leaves keypad visible" and "Keypad focus/blur timing matrix".

### 5. Keypad text edits do not participate in native text Undo

Priority: medium. Requires the optional keypad.

Reproduction:

1. Load a fresh native Onshape feature-filter input with the keypad enabled.
2. Enter `123` using the keypad buttons.
3. Press Ctrl+Z in that input. The value remains `123`.

Control: native hardware typing in Chrome and Brave creates undoable edits. In the same Brave session, hardware `123` changed to `12` after Ctrl+Z. In a freshly loaded Brave input, virtual `123` remained `123` after Ctrl+Z. The precise hardware undo grouping depends on typing timing; the virtual edits had no corresponding native history entry.

Cause: `insertText`, `deleteBackward`, and `clearInput` in `src/components/floating-cad-keyboard/useFloatingCadKeyboard.ts` assign `input.value` via `setNativeValue` and dispatch synthetic input/change events ([src/core/utils.ts:325–362](../../../src/core/utils.ts#L325-L362)). This updates the value without adding an edit to the browser's native undo history. Text insertion is verified; deletion/clear share the implementation pattern but were not independently tested for Undo.

Suggested correction: route text edits through a browser editing operation that participates in native input undo, or explicitly provide coherent undo/redo history. Dispatching an InputEvent after assigning value is insufficient.

Evidence: observations "Native and keypad text before Undo", "Native and keypad text after Undo", "Same-Brave native versus virtual text Undo", and "Fresh native input: keypad text has no Undo entry". The first same-Brave virtual run inherited a nonempty filter; the final fresh-input test removed that confound.

## Checks without a confirmed new stock regression

- Earlier automatic-dimension canvas stacking fix: editor is visible and pointer-hit-testable; stock entry and confirmation work.
- Shortcut menu: opening, Escape dismissal, and first ten Part Studio tooltip labels.
- Hardware Tab from a native filter with keypad enabled.
- Hardware Escape versus virtual keypad Escape in automatic dimension entry.
- Fullscreen entry/exit and settled toolbar layout.
- Workspace switching and repeated shortcut-menu use: attempted 40 round trips in each browser, with 39 end-of-cycle samples in each. No duplicate extension host appeared. Node/listener growth was also present in stock Onshape and did not establish an extension-specific leak. There was one early Brave title-wait timeout; additional late actionability timeouts affected both browsers while extra tabs temporarily backgrounded the test pages. These timing failures are not counted as extension bugs. Exact counts and measurements are in `workspace-soak-summary.json`.

## Supporting evidence

- [observations.json](observations.json): selected timestamped directed-test results supporting the findings and controls above.
- [workspace-soak-summary.json](workspace-soak-summary.json): first/last performance samples, completed sample counts, and all recorded soak errors.
- Screenshots are linked with the corresponding findings. The full local monitor logs and original preference snapshot are not needed to reproduce these findings and are not included.

## Cleanup verified

- Original extension preference snapshot restored exactly.
- Temporary sketch edits discarded: Chrome has four default features; Brave has its original eight features and no Sketch 5.
- Brave returned to editing its original Sketch 4, with the feature pane hidden as at the start.
- Original CSS viewport sizes restored (Chrome 1280×681; Brave 1587×852).
- Temporary comparison and extension-management tabs closed; extension re-enabled.
- Earlier source changes and package-file changes were left intact; the audit itself changed no repository source files.
