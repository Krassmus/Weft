import { strToU8, zipSync } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { buildRuntimeHtml } from "../runtime/buildRuntimeHtml";

export function assetZipPath(assetId: string, fileName: string): string {
  return `assets/${assetId}_${fileName}`;
}

/**
 * Packs a document into the .weft / exported-module zip: weft.json (the save format, verbatim -
 * including undo history), a generated index.html that plays the module stand-alone, and the
 * referenced binary assets. Save and "export as HTML module" both call this; they only differ
 * in the file extension the caller writes it under.
 */
export async function packDocument(doc: WeftDocument): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "weft.json": strToU8(JSON.stringify(doc, null, 2)),
    "index.html": strToU8(await buildRuntimeHtml(doc.content)),
  };

  const blobs = useAssetStore.getState().blobs;
  for (const meta of doc.content.assets) {
    const blob = blobs.get(meta.id);
    if (!blob) continue;
    files[assetZipPath(meta.id, meta.fileName)] = new Uint8Array(await blob.arrayBuffer());
  }

  return zipSync(files, { level: 6 });
}
