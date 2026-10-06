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

/** @font-face CSS with every font file inlined as a data: URI - for the sandboxed preview iframe
 * AND for the exported index.html. A page without an origin of its own (a srcDoc preview, or a
 * module an LMS runs in an iframe with sandbox but without allow-same-origin) can't use a relative
 * font URL at all: the browser always loads fonts as CORS requests, and an opaque origin is never
 * allowed without an Access-Control-Allow-Origin header the server would have to send. A data: URI
 * needs no request, so it works everywhere. (Images and videos are no such problem - they load
 * without CORS - which is why only fonts are inlined.) */
export async function buildInlineFontFaceCss(module: WeftModule): Promise<string> {
  const blobs = useAssetStore.getState().blobs;
  return buildFontFaceCss(module, resolveCuratedFile, async (font) => {
    const blob = blobs.get(font.id);
    return blob ? blobToDataUrl(blob) : "";
  });
}
