import { useEffect, useRef, useState } from "react";
import { buildPreviewAssetUrls } from "../../core/runtime/buildPreviewAssetUrls";
import { effectiveLanguage } from "../../core/document/translations";
import { useDocumentStore } from "../../core/document/store";
import { buildInlineFontFaceCss } from "../../core/runtime/buildInlineFontFaceCss";
import { buildRuntimeHtml } from "../../core/runtime/buildRuntimeHtml";
import { saveBytesAsFile, showWarning } from "../../core/io/fileIO";
import type { WeftModule } from "../../core/types";

/**
 * Renders the module exactly as it will play in the exported HTML - and, later, exactly as it
 * will appear embedded in the LMS - by building the same standalone document and dropping it
 * into a sandboxed iframe. No `allow-same-origin`, so the module genuinely cannot reach the
 * editor's window even though it runs in-process.
 */
export function PreviewFrame({ module, startPageId = null }: { module: WeftModule; startPageId?: string | null }) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Plays in the language the editor was showing.
  const editingLanguage = useDocumentStore((s) => s.editingLanguage);
  const startLanguage = effectiveLanguage(module.languages, editingLanguage);

  useEffect(() => {
    let cancelled = false;
    Promise.all([buildPreviewAssetUrls(module), buildInlineFontFaceCss(module)])
      .then(([assetUrls, fontFaceCss]) => buildRuntimeHtml(module, assetUrls, fontFaceCss, startPageId, startLanguage, true))
      .then((html) => {
        if (!cancelled) setSrcDoc(html);
      });
    return () => {
      cancelled = true;
    };
  }, [module, startPageId, startLanguage]);

  // A file the module offers for download (a files block) arrives here to be saved: the sandboxed frame can't
  // download, and a desktop window has no download of its own.
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
  }, []);

  if (!srcDoc) return <div className="weft-preview-loading">Vorschau wird geladen …</div>;

  return (
    <iframe
      ref={frameRef}
      className="weft-preview-frame"
      title="Lernmodul-Vorschau"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      // Focusing the iframe element itself (not anything inside it - the sandbox forbids that
      // anyway) routes keydown events to its document, which is what lets the module's own
      // Space/arrow-key navigation (see player.runtime.js) receive them at all.
      onLoad={(e) => e.currentTarget.focus()}
    />
  );
}
