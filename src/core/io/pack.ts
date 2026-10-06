import { strToU8, zip } from "fflate";
import type { AsyncZippable } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { usedAssetIds } from "../document/usedAssets";
import { buildInlineFontFaceCss } from "../runtime/buildInlineFontFaceCss";
import { buildRuntimeHtml } from "../runtime/buildRuntimeHtml";

export function assetZipPath(assetId: string, fileName: string): string {
  return `assets/${assetId}_${fileName}`;
}

/** Custom fonts are identified by id, exactly like assetZipPath, since two uploads could share a file
 * name. (Curated fonts have no file in the archive - see packDocument.) */
export function customFontZipPath(fontId: string, fileName: string): string {
  return `fonts/${fontId}_${fileName}`;
}

// Formats that are already compressed - deflating them again costs a lot of CPU for ~0% saving,
// so they're stored as-is (level 0). Video is by far the biggest of these.
const ALREADY_COMPRESSED = /\.(mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|ogg|wav|jpe?g|png|gif|webp|avif|heic|woff2?|zip)$/i;

/** Zips in a Web Worker (fflate's async API) so a big module never freezes the editor while it's
 * being saved - the synchronous zipSync used to block the main thread for as long as the
 * compression took (seconds, with a few videos in it). Buffers are handed over to the worker
 * without copying, which is safe here: every one of them is a fresh copy made just for this zip. */
function zipInWorker(files: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, { level: 6, consume: true }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/**
 * Packs a document into the .weft / exported-module zip: weft.json (the save format - verbatim
 * except for content.assets, pruned to only images/videos a block still actually references, see
 * usedAssetIds), a generated index.html that plays the module stand-alone, and the referenced
 * binary assets - images and videos, and the custom fonts (kept as files so a saved module can be
 * reopened). Every font the module uses - the curated ones its text actually references (see
 * fontFaceCss.ts - guaranteed to render the same everywhere the module ends up, unlike a system
 * font) and the custom ones - is also inlined into index.html as a data: URI. Save and "export as HTML module" both call
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

  // Every font is inlined into index.html as a data: URI, not shipped as a file next to it: a host
  // LMS may run the module in a sandboxed iframe without allow-same-origin, whose opaque origin the
  // browser refuses to load a (CORS-only) font file for. See buildInlineFontFaceCss.ts.
  const fontFaceCss = await buildInlineFontFaceCss(content);

  const files: AsyncZippable = {
    "weft.json": strToU8(JSON.stringify(docToSave, null, 2)),
    "index.html": strToU8(await buildRuntimeHtml(content, {}, fontFaceCss)),
  };
  const addFile = (path: string, data: Uint8Array) => {
    files[path] = ALREADY_COMPRESSED.test(path) ? [data, { level: 0 }] : data;
  };

  const blobs = useAssetStore.getState().blobs;
  for (const meta of usedAssets) {
    const blob = blobs.get(meta.id);
    if (!blob) continue;
    addFile(assetZipPath(meta.id, meta.fileName), new Uint8Array(await blob.arrayBuffer()));
  }

  for (const font of content.customFonts) {
    const blob = blobs.get(font.id);
    if (!blob) continue;
    addFile(customFontZipPath(font.id, font.fileName), new Uint8Array(await blob.arrayBuffer()));
  }

  return zipInWorker(files);
}
