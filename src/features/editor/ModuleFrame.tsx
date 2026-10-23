import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { safeLinkUrl } from "../../core/document/linkUrl";
import { saveBytesAsFile, showWarning } from "../../core/io/fileIO";
import { runsInTauri } from "../../core/platform";
import { tr } from "../../core/i18n/tr";

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
      if (e.source !== frameRef.current?.contentWindow || !data || data.source !== "weft-module") return;
      // A link of the module (a LinkBlock): the frame cannot open a tab itself - the desktop app hands the address to the system.
      if (data.type === "open-url") {
        const address = typeof data.url === "string" ? safeLinkUrl(data.url) : null;
        if (!address) return;
        if (runsInTauri()) void openUrl(address).catch(() => undefined);
        else window.open(address, "_blank", "noopener,noreferrer");
        return;
      }
      if (data.type !== "save-file") return;
      if (typeof data.name !== "string" || !(data.bytes instanceof Uint8Array)) return;
      saveBytesAsFile(data.name, String(data.mimeType ?? ""), data.bytes).catch((err) =>
        showWarning(tr("ui.file_could_not_be_saved", { error: err instanceof Error ? err.message : String(err) }), tr("ui.saving_failed")),
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
