import { useEffect, useRef, useState } from "react";
import type { ActionId, Settings as SettingsValue } from "../types";
import { ACTIONS } from "../storage";
import { eventToBinding, parseBinding } from "../shortcuts";

export function Settings({
  settings,
  save,
  close,
}: {
  settings: SettingsValue;
  save: (next: SettingsValue) => Promise<void>;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [recording, setRecording] = useState<ActionId | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = (document.activeElement as HTMLElement)?.shadowRoot
      ?.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);
  function persist(next: SettingsValue) {
    setDraft(next);
    void save(next).catch(() => setError("Could not save settings. Try again."));
  }
  function record(id: ActionId, event: React.KeyboardEvent<HTMLElement>) {
    if (recording !== id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    const value =
      event.key === "Backspace" ? "" : eventToBinding(event.nativeEvent);
    if (value === null) return;
    const duplicate = Object.entries(draft.keyboardShortcuts).find(
      ([key, binding]) =>
        key !== id &&
        value &&
        JSON.stringify(parseBinding(binding)) ===
          JSON.stringify(parseBinding(value)),
    );
    if (duplicate) {
      setError(`Already assigned to ${ACTIONS[duplicate[0] as ActionId]}.`);
      return;
    }
    persist({
      ...draft,
      keyboardShortcuts: { ...draft.keyboardShortcuts, [id]: value },
    });
    setRecording(null);
    setError("");
  }
  function onBindingKeyDown(
    id: ActionId,
    event: React.KeyboardEvent<HTMLLabelElement>,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      setRecording(id);
      return;
    }
    record(id, event);
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && !recording) {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab") {
      const elements = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not([tabindex="-1"]), [tabindex="0"]',
        ) ?? [],
      );
      const first = elements[0],
        last = elements.at(-1);
      const target = event.target;
      if (event.shiftKey && (target === first || target === dialog.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && target === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <div className="backdrop">
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={dialog}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id="settings-title">Onshape Mitigator settings</h2>
        <h3>Keyboard shortcuts</h3>
        <small>
          Click a binding and press a combination. Backspace clears; Escape
          cancels recording.
        </small>
        {(Object.keys(ACTIONS) as ActionId[]).map((id) => (
          <label
            className="binding"
            key={id}
            tabIndex={0}
            onKeyDown={(event) => onBindingKeyDown(id, event)}
          >
            {ACTIONS[id]}
            <input
              type="text"
              aria-label={ACTIONS[id]}
              readOnly
              tabIndex={-1}
              value={
                recording === id
                  ? "Press shortcut…"
                  : draft.keyboardShortcuts[id] || "Unbound"
              }
              onClick={() => setRecording(id)}
              onBlur={() => setRecording(null)}
              onKeyDown={(event) => record(id, event)}
            />
          </label>
        ))}
        <h3>AI assistant</h3>
        <label>
          Chatbot URL
          <input
            type="text"
            value={draft.aiChatbotUrl}
            onChange={(event) =>
              persist({ ...draft, aiChatbotUrl: event.target.value })
            }
          />
        </label>
        <small>
          Use {"{context}"} to include document context in the URL. Long context
          is shortened in the URL; the clipboard keeps the full snapshot.
        </small>
        <label>
          <input
            type="checkbox"
            checked={draft.aiOpenAfterCopy}
            onChange={(event) =>
              persist({ ...draft, aiOpenAfterCopy: event.target.checked })
            }
          />{" "}
          Open chatbot after copying
        </label>
        <small>
          Context is collected only when you choose Copy context or its
          shortcut. Opening a chatbot with {"{context}"} shares that context
          with the configured website.
        </small>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
