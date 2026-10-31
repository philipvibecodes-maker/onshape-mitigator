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
  configure,
  toggleEnabled,
}: {
  enabled: boolean;
  canCopy: boolean;
  canConfigure?: boolean;
  copying: boolean;
  shortcut: string;
  popup?: boolean;
  scale?: number;
  status?: string;
  close: () => void;
  copy: () => void;
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
        <button aria-label="Hide menu" onClick={close}>×</button>
      </header>
      {enabled && (
        <>
          <button disabled={!canCopy || copying} onClick={copy}>
            {copying ? "Copying context…" : "Copy context for AI"}
          </button>
          <button disabled={!canConfigure} onClick={configure}>Settings</button>
        </>
      )}
      <button onClick={toggleEnabled}>
        {enabled ? "Disable extension" : "Enable extension"}
      </button>
      {status && <p className="menu-status" role="status">{status}</p>}
    </section>
  );
}
