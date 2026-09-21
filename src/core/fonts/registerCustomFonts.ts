import { useEffect } from "react";
import { useDocumentStore } from "../document/store";
import { useAssetStore } from "../assets/assetStore";
import type { CustomFont } from "../types";

const registered = new Map<string, FontFace>();

/** Keeps document.fonts (the browser's live font registry, used by both the WYSIWYG canvas and
 * the sidebar thumbnails - both just render block.html's font-family/font-face as-is) in sync
 * with the current document's customFonts, adding new uploads and dropping removed ones. Curated
 * fonts don't need this - they're registered once, unconditionally, via the static @font-face
 * rules in fonts.css, since the whole curated set is always available regardless of document. */
export function useCustomFontRegistration() {
  const customFonts = useDocumentStore((s) => s.doc.content.customFonts);
  const blobs = useAssetStore((s) => s.blobs);

  useEffect(() => {
    let cancelled = false;
    const currentIds = new Set(customFonts.map((f) => f.id));

    for (const [id, face] of registered) {
      if (!currentIds.has(id)) {
        document.fonts.delete(face);
        registered.delete(id);
      }
    }

    async function registerOne(font: CustomFont) {
      if (registered.has(font.id)) return;
      const blob = blobs.get(font.id);
      if (!blob) return;
      try {
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        const face = new FontFace(font.family, buffer);
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        registered.set(font.id, face);
      } catch {
        // An unreadable/corrupt upload just doesn't render as itself - not worth surfacing as an
        // error over, the same way a broken image asset silently shows nothing rather than fails.
      }
    }

    void Promise.all(customFonts.map(registerOne));
    return () => {
      cancelled = true;
    };
  }, [customFonts, blobs]);
}
