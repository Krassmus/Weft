import { strToU8, zip } from "fflate";
import type { AsyncZippable } from "fflate";
import type { WeftDocument, WeftModule } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { Automerge } from "../collab/automerge";
import { currentHandle, useDocumentStore } from "../document/store";
import { usedAssetIds, withoutDeletedPages } from "../document/usedAssets";
import { coverLogoBytes, LOGO_FILE } from "./coverImage";
import { buildInlineFontFaceCss } from "../runtime/buildInlineFontFaceCss";
import { buildRuntimeHtml } from "../runtime/buildRuntimeHtml";

/** The Automerge history of the module inside the archive. */
export const HISTORY_FILE = "weft.automerge";

/** Which Automerge document the history belongs to ({ documentId }) - what keeps the link for sharing a
 * file the same every time it is opened. */
export const COLLAB_FILE = "weft.collab.json";

/** What marks an archive as a player file (see exportPlayerFile): it is all there is to say about it. */
export const PLAYER_MARKER_FILE = "weft-player.json";

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

/** Zips in a Web Worker of our own (zipWorker.ts), so that a big module never freezes the editor while it is being saved: not the
 * compression, and not the checksum of every file either (which fflate's own asynchronous zip leaves to the calling thread - most of
 * a second for a module with a large video). Buffers are handed over to the worker without copying, which is safe here: every one of
 * them is a fresh copy made just for this zip. Where there are no workers, fflate's asynchronous zip does it. */
function zipInWorker(files: AsyncZippable): Promise<Uint8Array> {
  if (typeof Worker === "undefined") {
    return new Promise((resolve, reject) => {
      zip(files, { level: 6, consume: true }, (err, data) => (err ? reject(err) : resolve(data)));
    });
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./zipWorker.ts", import.meta.url), { type: "module" });
    const transfer: ArrayBuffer[] = [];
    for (const entry of Object.values(files)) {
      const data = Array.isArray(entry) ? entry[0] : entry;
      if (data instanceof Uint8Array && data.buffer instanceof ArrayBuffer && !transfer.includes(data.buffer)) transfer.push(data.buffer);
    }
    worker.onmessage = (event: MessageEvent<{ bytes?: Uint8Array; error?: string }>) => {
      worker.terminate();
      if (event.data.bytes) resolve(event.data.bytes);
      else reject(new Error(event.data.error ?? "zip failed"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "zip failed"));
    };
    worker.postMessage({ files }, transfer);
  });
}

/**
 * Packs a document into the .weft / exported-module zip: weft.json (the save format - verbatim
 * except for content.assets, pruned to only images/videos a block still actually references, see
 * usedAssetIds - which leaves out what only a deleted page used), a generated index.html that plays the module stand-alone, and the referenced
 * binary assets - images and videos, and the custom fonts (kept as files so a saved module can be
 * reopened). Every font the module uses - the curated ones its text actually references (see
 * fontFaceCss.ts - guaranteed to render the same everywhere the module ends up, unlike a system
 * font) and the custom ones - is also inlined into index.html as a data: URI. Save and "export as HTML module" both call
 * this; they differ in the file extension the caller writes it under - and in `forExport`: an
 * exported module goes to the people who learn from it, so it carries neither the editing history
 * (which still holds every text that was deleted or rewritten along the way) nor the id of the
 * document it was edited as. It opens again as a module of its own, with a history starting there.
 */
export async function packDocument(doc: WeftDocument, options: { forExport?: boolean; playerOnly?: boolean } = {}): Promise<Uint8Array> {
  // A player file is an export that goes further: nothing Weft could edit it from - no weft.json, no history
  // - just the page that plays the module, and what it plays (see PLAYER_MARKER_FILE).
  const forExport = options.forExport || options.playerOnly;
  // doc.content.assets is append-only during editing (see usedAssetIds' own comment) - a block
  // deleted or a file replaced mid-session leaves its old asset behind, still listed, still
  // bundled, forever, unless filtered back down to only what's still actually referenced right
  // here at save/export time.
  const usedIds = usedAssetIds(doc.content);
  const usedAssets = doc.content.assets.filter((meta) => usedIds.has(meta.id));
  const content = { ...doc.content, assets: usedAssets };
  // The pages that were deleted are still in `pages` (see removePage): a saved file keeps them in weft.json - they belong to the editing history it carries, which is
  // only used if it describes exactly weft.json - but the page that plays the module has no use for them, and an export (which has no history) carries nothing of
  // what was deleted.
  const played = withoutDeletedPages(content);
  const docToSave: WeftDocument = { formatVersion: doc.formatVersion, content: forExport ? played : content };

  // Every font is inlined into index.html as a data: URI, not shipped as a file next to it: a host
  // LMS may run the module in a sandboxed iframe without allow-same-origin, whose opaque origin the
  // browser refuses to load a (CORS-only) font file for. See buildInlineFontFaceCss.ts.
  const fontFaceCss = await buildInlineFontFaceCss(played);

  const files: AsyncZippable = {
    "index.html": strToU8(await buildRuntimeHtml(played, {}, fontFaceCss)),
  };
  if (options.playerOnly) files[PLAYER_MARKER_FILE] = strToU8(JSON.stringify({ format: "weft-player", version: 1 }));
  else files["weft.json"] = strToU8(JSON.stringify(docToSave, null, 2));
  // The editing history, so that this file can later be merged with other copies of the same module
  // (see mergeHistory in document/store.ts) instead of only ever being replaced by them. weft.json
  // stays the readable description of the same state (and what older versions and other tools
  // read); on opening, the history is used only if it still describes exactly that state.
  // Already compressed - stored as is.
  if (!forExport && Automerge.getObjectId(doc.content) !== null) {
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
  // The cover picture is the file logo.png at the top, not one of the assets - the picture of the first slide if the module has no cover (not in
  // a player file: it is only there to be played).
  if (!options.playerOnly) {
    const logo = await coverLogoBytes(content, { fresh: !!options.forExport });
    if (logo) files[LOGO_FILE] = [logo, { level: 0 }];
  }
  for (const meta of usedAssets) {
    if (meta.id === content.coverAssetId) continue;
    const blob = blobs.get(meta.id);
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // In an export an encrypted file is only a script (see encryptedScriptPath); in a saved module it stays raw, which
    // is what Weft opens it from.
    if (forExport && isEncryptedAsset(meta.fileName)) addFile(encryptedScriptPath(meta.id, meta.fileName), encryptedScript(meta.id, bytes));
    else addFile(assetZipPath(meta.id, meta.fileName), bytes);
  }

  // (The fonts are inside index.html already; their files are only for opening the module in Weft again.)
  for (const font of options.playerOnly ? [] : content.customFonts) {
    const blob = blobs.get(font.id);
    if (!blob) continue;
    addFile(customFontZipPath(font.id, font.fileName), new Uint8Array(await blob.arrayBuffer()));
  }

  return zipInWorker(files);
}
