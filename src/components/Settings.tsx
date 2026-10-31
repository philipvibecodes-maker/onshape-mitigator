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
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = (document.activeElement as HTMLElement)?.shadowRoot
      ?.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);
  function record(id: ActionId, event: React.KeyboardEvent<HTMLInputElement>) {
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
    setDraft({
      ...draft,
      keyboardShortcuts: { ...draft.keyboardShortcuts, [id]: value },
    });
    setRecording(null);
    setError("");
  }
  async function submit() {
    if (draft.aiChatbotUrl) {
      try {
        const url = new URL(draft.aiChatbotUrl.replace("{context}", "context"));
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        setError("Enter an HTTP or HTTPS chatbot URL.");
        return;
      }
    }
    setSaving(true);
    try {
      await save(draft);
      close();
    } catch {
      setError("Could not save settings. Try again.");
      setSaving(false);
    }
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && !recording) {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab") {
      const elements = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, [tabindex="0"]',
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
          <label className="binding" key={id}>
            {ACTIONS[id]}
            <input
              type="text"
              aria-label={ACTIONS[id]}
              readOnly
              value={
                recording === id
                  ? "Press shortcut…"
                  : draft.keyboardShortcuts[id] || "Unbound"
              }
              onFocus={() => setRecording(id)}
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
              setDraft({ ...draft, aiChatbotUrl: event.target.value })
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
              setDraft({ ...draft, aiOpenAfterCopy: event.target.checked })
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
          <button onClick={close} disabled={saving}>
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
