import { strFromU8, unzipSync } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { assetZipPath, customFontZipPath } from "./pack";

export function unpackDocument(zipBytes: Uint8Array): WeftDocument {
  const files = unzipSync(zipBytes);

  const jsonBytes = files["weft.json"];
  if (!jsonBytes) throw new Error("weft.json fehlt im Archiv – das ist keine gültige Weft-Datei.");
  const doc = JSON.parse(strFromU8(jsonBytes)) as WeftDocument;
  // Older saves predate custom fonts - default rather than leave undefined, since every
  // customFonts.map/forEach elsewhere assumes an array.
  doc.content.customFonts ??= [];

  const setAsset = useAssetStore.getState().setAsset;
  for (const meta of doc.content.assets) {
    const bytes = files[assetZipPath(meta.id, meta.fileName)];
    if (bytes) setAsset(meta.id, new Blob([bytes], { type: meta.mimeType }));
  }
  for (const font of doc.content.customFonts) {
    const bytes = files[customFontZipPath(font.id, font.fileName)];
    if (bytes) setAsset(font.id, new Blob([bytes], { type: font.mimeType }));
  }

  return doc;
}
