import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { saveBytesAsFile, showWarning } from "../../core/io/fileIO";

/**
 * A module's page in a sandboxed frame (no `allow-same-origin`: it genuinely can't reach the window around it).
 * Used by the editor's preview (PreviewFrame.tsx) and by the player of a player file (features/player/).
 * The frame gets keyboard focus on load - which is what lets the module's own Space/arrow-key navigation
 * receive them at all - and the files the module offers for download arrive here to be saved: a sandboxed
 * frame can't download, and a desktop window has no download of its own.
 */
export function ModuleFrame({ srcDoc, title, frameRef: outerRef }: { srcDoc: string; title: string; frameRef?: RefObject<HTMLIFrameElement | null> }) {
  const ownRef = useRef<HTMLIFrameElement>(null);
  const frameRef = outerRef ?? ownRef;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (e.source !== frameRef.current?.contentWindow || !data || data.source !== "weft-module" || data.type !== "save-file") return;
      if (typeof data.name !== "string" || !(data.bytes instanceof Uint8Array)) return;
      saveBytesAsFile(data.name, String(data.mimeType ?? ""), data.bytes).catch((err) =>
        showWarning(`Die Datei ließ sich nicht speichern: ${err instanceof Error ? err.message : String(err)}`, "Speichern fehlgeschlagen"),
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef]);

  return (
    <iframe
      ref={frameRef}
      className="weft-preview-frame"
      title={title}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      onLoad={(e) => e.currentTarget.focus()}
    />
  );
}
