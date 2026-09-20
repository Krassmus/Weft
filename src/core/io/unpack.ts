import { strFromU8, unzipSync } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { assetZipPath } from "./pack";

export function unpackDocument(zipBytes: Uint8Array): WeftDocument {
  const files = unzipSync(zipBytes);

  const jsonBytes = files["weft.json"];
  if (!jsonBytes) throw new Error("weft.json fehlt im Archiv – das ist keine gültige Weft-Datei.");
  const doc = JSON.parse(strFromU8(jsonBytes)) as WeftDocument;

  const setAsset = useAssetStore.getState().setAsset;
  for (const meta of doc.content.assets) {
    const bytes = files[assetZipPath(meta.id, meta.fileName)];
    if (bytes) setAsset(meta.id, new Blob([bytes], { type: meta.mimeType }));
  }

  return doc;
}
