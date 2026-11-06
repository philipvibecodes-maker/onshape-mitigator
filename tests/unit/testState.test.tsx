import { describe, expect, it } from "vitest";
import { MAX_STATE_BYTES, parseTestState, sanitizeStateDom } from "../../src/testState";
import snapshot from "../states/onshape-sketch-edit.json";

describe("offline captures", () => {
  it("rejects unknown schemas, invalid adapter data, paths and viewport sizes", () => {
    for (const invalid of [
      { ...snapshot, version: 2 }, { ...snapshot, path: "//evil.test/documents/a" },
      { ...snapshot, state: { ready: true } }, { ...snapshot, selections: [null] },
      { ...snapshot, viewport: { width: -1, height: 720 } },
    ]) expect(() => parseTestState(JSON.stringify(invalid))).toThrow();
    expect(parseTestState(JSON.stringify(snapshot)).state.toolbarType).toBe("Sketch");
  });

  it("accepts real-scale captures and rejects files over 25 MB", () => {
    const realScale = JSON.stringify({ ...snapshot, html: "x".repeat(13_000_000) });
    expect(new TextEncoder().encode(realScale).length).toBeLessThan(MAX_STATE_BYTES);
    expect(parseTestState(realScale).html).toHaveLength(13_000_000);
    expect(() => parseTestState(" ".repeat(MAX_STATE_BYTES + 1))).toThrow("25 MB");
  });

  it("strips executable markup, resources, credentials and extension patches on import", () => {
    const parsed = new DOMParser().parseFromString(`<body><!--secret-->
      <script>alert(1)</script><iframe src="https://example.test"></iframe>
      <img src="https://example.test"><input type="password" value="secret">
      <input value="secret" ng-click="run()" data-token="secret" onclick="run()">
      <textarea>secret</textarea><a href="javascript:alert(1)">Link</a>
      <div style="background-image:url(https://example.test)">No asset</div>
      <div id="feature-dialog" class="mitigator-sketch-collapsed" style="width:300px"></div>
      <div id="onshape-extension-host">Old plugin</div>
      <svg><use href="#variable-table-button"></use><path fill="url(https://example.test)" /></svg></body>`, "text/html");
    sanitizeStateDom(parsed.body);
    expect(parsed.body.innerHTML).not.toMatch(/secret|onclick|ng-click|data-token|https:|javascript:|<script|<iframe|<img|mitigator-sketch-collapsed|Old plugin/);
    expect(parsed.body.querySelector("#feature-dialog")?.getAttribute("style")).toBe("width:300px");
    expect(parsed.body.querySelector("use")?.getAttribute("href")).toBe("#variable-table-button");
  });
});
