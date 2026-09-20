import type { WeftModule } from "../types";
import { useAssetStore } from "../assets/assetStore";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Data-URI map for every asset the module references, for use as the preview iframe's srcDoc. */
export async function buildPreviewAssetUrls(module: WeftModule): Promise<Record<string, string>> {
  const blobs = useAssetStore.getState().blobs;
  const entries = await Promise.all(
    module.assets.map(async (meta) => {
      const blob = blobs.get(meta.id);
      if (!blob) return null;
      return [meta.id, await blobToDataUrl(blob)] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}
