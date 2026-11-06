import { MAX_STATE_BYTES, parseTestState } from "../../src/testState";
import { loadTestState } from "./load";

const captures = import.meta.glob("../states/**/*.json", { eager: true, import: "default" });
const list = document.querySelector("#states")!;
const error = document.querySelector("#error")!;
function report(reason: unknown) {
  error.textContent = reason instanceof Error ? reason.message : "Could not load state.";
}
for (const [path, value] of Object.entries(captures)) {
  const item = document.createElement("li");
  try {
    const snapshot = parseTestState(JSON.stringify(value));
    const button = document.createElement("button");
    button.textContent = snapshot.name;
    button.addEventListener("click", () => void loadTestState(snapshot).catch(report));
    item.append(button, document.createTextNode(`${snapshot.state.toolbarType ?? "unavailable"} — ${snapshot.notes}`));
  } catch (reason) {
    item.textContent = `${path}: ${reason instanceof Error ? reason.message : "invalid state"}`;
  }
  list.append(item);
}
document.querySelector<HTMLInputElement>("#state-file")!.addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_STATE_BYTES) throw new Error("State exceeds the 25 MB limit.");
    await loadTestState(parseTestState(await file.text()));
  } catch (reason) { report(reason); }
});
