import { strToU8, zipSync } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { usedAssetIds } from "../document/usedAssets";
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
 * Packs a document into the .weft / exported-module zip: weft.json (the save format - verbatim
 * except for content.assets, pruned to only images/videos a block still actually references, see
 * usedAssetIds), a generated index.html that plays the module stand-alone, and the referenced
 * binary assets - images and videos, and fonts: every curated font the document's text actually
 * uses (see fontFaceCss.ts - guaranteed to render the same everywhere the module ends up, unlike
 * a system font) plus every custom font it carries. Save and "export as HTML module" both call
 * this; they only differ in the file extension the caller writes it under.
 */
export async function packDocument(doc: WeftDocument): Promise<Uint8Array> {
  // doc.content.assets is append-only during editing (see usedAssetIds' own comment) - a block
  // deleted or a file replaced mid-session leaves its old asset behind, still listed, still
  // bundled, forever, unless filtered back down to only what's still actually referenced right
  // here at save/export time.
  const usedIds = usedAssetIds(doc.content);
  const usedAssets = doc.content.assets.filter((meta) => usedIds.has(meta.id));
  const content = { ...doc.content, assets: usedAssets };
  const docToSave: WeftDocument = { ...doc, content };

  const fontFaceCss = await buildFontFaceCss(
    content,
    (fileName) => Promise.resolve(curatedFontZipPath(fileName)),
    (font) => Promise.resolve(customFontZipPath(font.id, font.fileName)),
  );

  const files: Record<string, Uint8Array> = {
    "weft.json": strToU8(JSON.stringify(docToSave, null, 2)),
    "index.html": strToU8(await buildRuntimeHtml(content, {}, fontFaceCss)),
  };

  const blobs = useAssetStore.getState().blobs;
  for (const meta of usedAssets) {
    const blob = blobs.get(meta.id);
    if (!blob) continue;
    files[assetZipPath(meta.id, meta.fileName)] = new Uint8Array(await blob.arrayBuffer());
  }

  for (const font of content.customFonts) {
    const blob = blobs.get(font.id);
    if (!blob) continue;
    files[customFontZipPath(font.id, font.fileName)] = new Uint8Array(await blob.arrayBuffer());
  }

  const seenCuratedFiles = new Set<string>();
  for (const curated of usedCuratedFonts(content)) {
    for (const face of curated.faces) {
      if (seenCuratedFiles.has(face.file)) continue;
      seenCuratedFiles.add(face.file);
      const res = await fetch(`/fonts/${face.file}`);
      files[curatedFontZipPath(face.file)] = new Uint8Array(await res.arrayBuffer());
    }
  }

  return zipSync(files, { level: 6 });
}
