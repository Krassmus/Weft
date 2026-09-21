import type { WeftModule } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { buildFontFaceCss } from "../fonts/fontFaceCss";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const curatedFileCache = new Map<string, Promise<string>>();

/** Curated font files are static app assets (public/fonts/), not document blobs - fetched once
 * per file name and cached for the process lifetime, since they never change underneath us. */
function resolveCuratedFile(fileName: string): Promise<string> {
  let cached = curatedFileCache.get(fileName);
  if (!cached) {
    cached = fetch(`/fonts/${fileName}`)
      .then((res) => res.blob())
      .then(blobToDataUrl);
    curatedFileCache.set(fileName, cached);
  }
  return cached;
}

/** @font-face CSS for the sandboxed preview iframe - every URL pre-resolved to a data: URI,
 * since an opaque-origin srcDoc can't fetch a relative path (same reason images go through
 * buildPreviewAssetUrls instead of a plain relative <img src>). */
export async function buildPreviewFontFaceCss(module: WeftModule): Promise<string> {
  const blobs = useAssetStore.getState().blobs;
  return buildFontFaceCss(module, resolveCuratedFile, async (font) => {
    const blob = blobs.get(font.id);
    return blob ? blobToDataUrl(blob) : "";
  });
}
