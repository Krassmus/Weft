import type { WeftModule } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { usedAssetIds } from "../document/usedAssets";
import { localAssetUrl } from "../io/localAssetUrl";

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** URL map for every asset the module actually references, for use as the preview iframe's
 * srcDoc - filtered through usedAssetIds rather than a plain map over module.assets, since that
 * list is append-only and would otherwise mean re-encoding every image/video ever uploaded and
 * since deleted or replaced on every single preview open. Video goes through Tauri's asset
 * protocol instead of a data: URI (see localAssetUrl for why - in short, a large data: URI can
 * make WebKit's video decoder fail outright, not just load slowly); everything else (images,
 * typically small) keeps the simpler data: URI, including video itself when running outside
 * Tauri, where the asset protocol isn't available at all. */
export async function buildPreviewAssetUrls(module: WeftModule): Promise<Record<string, string>> {
  const blobs = useAssetStore.getState().blobs;
  const usedIds = usedAssetIds(module);
  const entries = await Promise.all(
    module.assets
      .filter((meta) => usedIds.has(meta.id))
      .map(async (meta) => {
        const blob = blobs.get(meta.id);
        if (!blob) return null;
        if (meta.mimeType.startsWith("video/")) {
          const url = await localAssetUrl(meta.id, blob, meta.fileName);
          if (url) return [meta.id, url] as const;
        }
        return [meta.id, await blobToDataUrl(blob)] as const;
      }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}
