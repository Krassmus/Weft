import { strToU8, zip } from "fflate";
import type { AsyncZippable } from "fflate";
import type { WeftDocument, WeftModule } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { Automerge } from "../collab/automerge";
import { currentHandle, useDocumentStore } from "../document/store";
import { usedAssetIds } from "../document/usedAssets";
import { buildInlineFontFaceCss } from "../runtime/buildInlineFontFaceCss";
import { buildRuntimeHtml } from "../runtime/buildRuntimeHtml";

/** The Automerge history of the module inside the archive. */
export const HISTORY_FILE = "weft.automerge";

/** Which Automerge document the history belongs to ({ documentId }) - what keeps the link for sharing a
 * file the same every time it is opened. */
export const COLLAB_FILE = "weft.collab.json";

export function assetZipPath(assetId: string, fileName: string): string {
  return `assets/${assetId}_${fileName}`;
}

/** An asset of a password-protected files block (see filesActions.ts): its bytes are ciphertext. */
export function isEncryptedAsset(fileName: string): boolean {
  return fileName.endsWith(".enc");
}

/** Where an exported module keeps an encrypted asset: as a script file that hands its bytes (as base64) to the player
 * (weftEncryptedFile in player.runtime.js). A page opened from a folder may not fetch() a file next to it, but
 * any page may load a script - this is what lets protected downloads work from a plain index.html on a disk. */
export function encryptedScriptPath(assetId: string, fileName: string): string {
  return `${assetZipPath(assetId, fileName)}.js`;
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** The script of an encrypted asset (see encryptedScriptPath) for `bytes`. */
export function encryptedScript(assetId: string, bytes: Uint8Array): Uint8Array {
  return strToU8(`weftEncryptedFile(${JSON.stringify(assetId)},"${toBase64(bytes)}");\n`);
}

/** Custom fonts are identified by id, exactly like assetZipPath, since two uploads could share a file
 * name. (Curated fonts have no file in the archive - see packDocument.) */
export function customFontZipPath(fontId: string, fileName: string): string {
  return `fonts/${fontId}_${fileName}`;
}

// Formats that are already compressed - deflating them again costs a lot of CPU for ~0% saving,
// so they're stored as-is (level 0). Video is by far the biggest of these.
const ALREADY_COMPRESSED = /\.(mp4|m4v|mov|webm|mkv|avi|mp3|m4a|aac|ogg|wav|jpe?g|png|gif|webp|avif|heic|woff2?|zip|enc)$/i;

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
 * this; they differ in the file extension the caller writes it under - and in `forExport`: an
 * exported module goes to the people who learn from it, so it carries neither the editing history
 * (which still holds every text that was deleted or rewritten along the way) nor the id of the
 * document it was edited as. It opens again as a module of its own, with a history starting there.
 */
export async function packDocument(doc: WeftDocument, options: { forExport?: boolean } = {}): Promise<Uint8Array> {
  // doc.content.assets is append-only during editing (see usedAssetIds' own comment) - a block
  // deleted or a file replaced mid-session leaves its old asset behind, still listed, still
  // bundled, forever, unless filtered back down to only what's still actually referenced right
  // here at save/export time.
  const usedIds = usedAssetIds(doc.content);
  const usedAssets = doc.content.assets.filter((meta) => usedIds.has(meta.id));
  const content = { ...doc.content, assets: usedAssets };
  const docToSave: WeftDocument = { formatVersion: doc.formatVersion, content };

  // Every font is inlined into index.html as a data: URI, not shipped as a file next to it: a host
  // LMS may run the module in a sandboxed iframe without allow-same-origin, whose opaque origin the
  // browser refuses to load a (CORS-only) font file for. See buildInlineFontFaceCss.ts.
  const fontFaceCss = await buildInlineFontFaceCss(content);

  const files: AsyncZippable = {
    "weft.json": strToU8(JSON.stringify(docToSave, null, 2)),
    "index.html": strToU8(await buildRuntimeHtml(content, {}, fontFaceCss)),
  };
  // The editing history, so that this file can later be merged with other copies of the same module
  // (see mergeHistory in document/store.ts) instead of only ever being replaced by them. weft.json
  // stays the readable description of the same state (and what older versions and other tools
  // read); on opening, the history is used only if it still describes exactly that state.
  // Already compressed - stored as is.
  if (!options.forExport && Automerge.getObjectId(doc.content) !== null) {
    files[HISTORY_FILE] = [Automerge.save(doc.content as Automerge.Doc<WeftModule>), { level: 0 }];
    // ...and under which id it was edited, so that opening it later - on any computer - is the same
    // document again (see loadDocument in document/store.ts).
    const handle = currentHandle();
    if ((handle.doc() as WeftModule).id === doc.content.id) {
      // The password too, if this file is an invitation to live collaboration (never in an export).
      const live = useDocumentStore.getState().live;
      files[COLLAB_FILE] = strToU8(JSON.stringify({ documentId: handle.documentId, ...(live ? { live } : {}) }));
    }
  }
  const addFile = (path: string, data: Uint8Array) => {
    files[path] = ALREADY_COMPRESSED.test(path) ? [data, { level: 0 }] : data;
  };

  const blobs = useAssetStore.getState().blobs;
  for (const meta of usedAssets) {
    const blob = blobs.get(meta.id);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // In an export an encrypted file is only a script (see encryptedScriptPath); in a saved module it stays raw, which
    // is what Weft opens it from.
    if (options.forExport && isEncryptedAsset(meta.fileName)) addFile(encryptedScriptPath(meta.id, meta.fileName), encryptedScript(meta.id, bytes));
    else addFile(assetZipPath(meta.id, meta.fileName), bytes);
  }

  for (const font of content.customFonts) {
    const blob = blobs.get(font.id);
    if (!blob) continue;
    addFile(customFontZipPath(font.id, font.fileName), new Uint8Array(await blob.arrayBuffer()));
  }

  return zipInWorker(files);
}
