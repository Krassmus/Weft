import { strToU8, zipSync } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { buildFontFaceCss, usedCuratedFonts } from "../fonts/fontFaceCss";
import { buildRuntimeHtml } from "../runtime/buildRuntimeHtml";

export function assetZipPath(assetId: string, fileName: string): string {
  return `assets/${assetId}_${fileName}`;
}

/** Curated fonts are identified by their (already-unique) static file name alone - custom fonts
 * by id, exactly like assetZipPath, since two uploads could share a file name. */
export function curatedFontZipPath(fileName: string): string {
  return `fonts/${fileName}`;
}

export function customFontZipPath(fontId: string, fileName: string): string {
  return `fonts/${fontId}_${fileName}`;
}

/**
 * Packs a document into the .weft / exported-module zip: weft.json (the save format, verbatim -
 * including undo history), a generated index.html that plays the module stand-alone, and the
 * referenced binary assets - images, and now fonts: every curated font the document's text
 * actually uses (see fontFaceCss.ts - guaranteed to render the same everywhere the module ends
 * up, unlike a system font) plus every custom font it carries. Save and "export as HTML module"
 * both call this; they only differ in the file extension the caller writes it under.
 */
export async function packDocument(doc: WeftDocument): Promise<Uint8Array> {
  const fontFaceCss = await buildFontFaceCss(
    doc.content,
    (fileName) => Promise.resolve(curatedFontZipPath(fileName)),
    (font) => Promise.resolve(customFontZipPath(font.id, font.fileName)),
  );

  const files: Record<string, Uint8Array> = {
    "weft.json": strToU8(JSON.stringify(doc, null, 2)),
    "index.html": strToU8(await buildRuntimeHtml(doc.content, {}, fontFaceCss)),
  };

  const blobs = useAssetStore.getState().blobs;
  for (const meta of doc.content.assets) {
    const blob = blobs.get(meta.id);
    if (!blob) continue;
    files[assetZipPath(meta.id, meta.fileName)] = new Uint8Array(await blob.arrayBuffer());
  }

  for (const font of doc.content.customFonts) {
    const blob = blobs.get(font.id);
    if (!blob) continue;
    files[customFontZipPath(font.id, font.fileName)] = new Uint8Array(await blob.arrayBuffer());
  }

  const seenCuratedFiles = new Set<string>();
  for (const curated of usedCuratedFonts(doc.content)) {
    for (const face of curated.faces) {
      if (seenCuratedFiles.has(face.file)) continue;
      seenCuratedFiles.add(face.file);
      const res = await fetch(`/fonts/${face.file}`);
      files[curatedFontZipPath(face.file)] = new Uint8Array(await res.arrayBuffer());
    }
  }

  return zipSync(files, { level: 6 });
}
