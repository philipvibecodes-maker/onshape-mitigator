// Install before Onshape registers capture listeners. Stopping an event only
// inside React's shadow root is too late for window/document capture handlers.
(() => {
  for (const type of ["keydown", "keypress", "keyup"]) {
    window.addEventListener(
      type,
      (event) => {
        const path = event.composedPath();
        const target = path[0];
        if (!(target instanceof HTMLElement)) return;
        if (
          !path.some(
            (node) =>
              node instanceof HTMLElement &&
              node.id === "onshape-extension-host",
          )
        )
          return;

        event.stopImmediatePropagation();
        // Deliver a local copy so React controls (Escape, Enter, shortcut capture,
        // etc.) still receive keys. The original retains the browser's default
        // text editing, including trusted input events and native Undo.
        const local = new KeyboardEvent(type, {
          key: event.key,
          code: event.code,
          location: event.location,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          repeat: event.repeat,
          isComposing: event.isComposing,
          keyCode: event.keyCode,
          charCode: event.charCode,
          bubbles: true,
          cancelable: true,
          composed: false,
        });
        if (!target.dispatchEvent(local)) event.preventDefault();
      },
      true,
    );
  }
})();
