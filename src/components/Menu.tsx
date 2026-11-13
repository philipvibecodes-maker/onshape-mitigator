import { useEffect, useRef, type CSSProperties } from "react";
import { matchesBinding } from "../shortcuts";

export function Menu({
  enabled,
  canCopy,
  canConfigure = true,
  copying,
  shortcut,
  popup = false,
  scale = 1,
  status,
  close,
  copy,
  copyDetailed,
  configure,
  toggleEnabled,
}: {
  enabled: boolean;
  canCopy: boolean;
  canConfigure?: boolean;
  copying: "topology" | "detailed" | null;
  shortcut: string;
  popup?: boolean;
  scale?: number;
  status?: string;
  close: () => void;
  copy: () => void;
  copyDetailed: () => void;
  configure: () => void;
  toggleEnabled: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => element.current?.focus(), []);
  return (
    <section
      className={`menu${popup ? " menu-popup" : ""}`}
      style={{ "--menu-scale": scale } as CSSProperties}
      aria-label="Onshape Mitigator menu"
      ref={element}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" ||
          (shortcut && matchesBinding(event.nativeEvent, shortcut))
        ) {
          event.preventDefault();
          close();
        }
      }}
    >
      <header>
        <strong>Onshape Mitigator</strong>
      </header>
      {enabled && (
        <>
          <button
            data-menu-primary
            disabled={!canCopy || copying !== null}
            onClick={copy}
          >
            {copying === "topology" ? "Copying context…" : "Copy context for AI"}
          </button>
          <button
            disabled={!canCopy || copying !== null}
            onClick={copyDetailed}
          >
            {copying === "detailed" ? "Copying detailed info…" : "Copy detailed info"}
          </button>
          <button disabled={!canConfigure} onClick={configure}>Settings</button>
        </>
      )}
      <button onClick={toggleEnabled}>
        {enabled ? "Disable extension" : "Enable extension"}
      </button>
      {status && <p className="menu-status" role="status">{status}</p>}
      <button className="menu-close" aria-label="Hide menu" onClick={close}>×</button>
    </section>
  );
}
