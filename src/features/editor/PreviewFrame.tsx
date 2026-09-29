import { useEffect, useState } from "react";
import { buildPreviewAssetUrls } from "../../core/runtime/buildPreviewAssetUrls";
import { buildPreviewFontFaceCss } from "../../core/runtime/buildPreviewFontUrls";
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([buildPreviewAssetUrls(module), buildPreviewFontFaceCss(module)])
      .then(([assetUrls, fontFaceCss]) => buildRuntimeHtml(module, assetUrls, fontFaceCss, startPageId))
      .then((html) => {
        if (!cancelled) setSrcDoc(html);
      });
    return () => {
      cancelled = true;
    };
  }, [module, startPageId]);

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
