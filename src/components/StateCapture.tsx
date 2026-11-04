import { useState } from "react";
import { captureTestState, downloadTestState } from "../testState";
import { isDocumentPage } from "../adapter/dom";

export function StateCapture() {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function capture() {
    setBusy(true);
    setStatus("");
    try {
      const snapshot = await captureTestState(name, notes);
      downloadTestState(snapshot);
      setStatus(snapshot.state.ready
        ? "Test state saved. Open it in the local state viewer to replay."
        : "Partial state saved: Onshape adapter was unavailable. See offline testing documentation.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save test state. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <h3>Offline testing</h3>
    <small>
      Save the current document UI for offline plugin tests. Captures include
      document text, selection, features and variables. Review before sharing.
      Scripts, form values and remote assets are excluded; CAD geometry and native actions are not replayed.
    </small>
    <label>Test state name
      <input type="text" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
    </label>
    <label>Expected behavior / steps
      <input type="text" maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />
    </label>
    <button disabled={busy || !name.trim() || !isDocumentPage()} onClick={() => void capture()}>
      {busy ? "Saving test state…" : "Save test state"}
    </button>
    {status && <p role="status">{status}</p>}
  </>;
}
