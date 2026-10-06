import { useEffect, useState } from "react";
import { buildPreviewAssetUrls } from "../../core/runtime/buildPreviewAssetUrls";
import { effectiveLanguage } from "../../core/document/translations";
import { useDocumentStore } from "../../core/document/store";
import { buildInlineFontFaceCss } from "../../core/runtime/buildInlineFontFaceCss";
import { buildRuntimeHtml } from "../../core/runtime/buildRuntimeHtml";
import type { WeftModule } from "../../core/types";

/**
 * Renders the module exactly as it will play in the exported HTML - and, later, exactly as it
 * will appear embedded in the LMS - by building the same standalone document and dropping it
 * into a sandboxed iframe. No `allow-same-origin`, so the module genuinely cannot reach the
 * editor's window even though it runs in-process.
 */
export function PreviewFrame({ module, startPageId = null }: { module: WeftModule; startPageId?: string | null }) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  // Plays in the language the editor was showing.
  const editingLanguage = useDocumentStore((s) => s.editingLanguage);
  const startLanguage = effectiveLanguage(module.languages, editingLanguage);

  useEffect(() => {
    let cancelled = false;
    Promise.all([buildPreviewAssetUrls(module), buildInlineFontFaceCss(module)])
      .then(([assetUrls, fontFaceCss]) => buildRuntimeHtml(module, assetUrls, fontFaceCss, startPageId, startLanguage))
      .then((html) => {
        if (!cancelled) setSrcDoc(html);
      });
    return () => {
      cancelled = true;
    };
  }, [module, startPageId, startLanguage]);

  if (!srcDoc) return <div className="weft-preview-loading">Vorschau wird geladen …</div>;

  return (
    <iframe
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
