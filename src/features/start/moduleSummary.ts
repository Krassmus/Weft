import { strFromU8, unzipSync } from "fflate";
import { aspectRatioNumeric } from "../../core/aspectRatio";
import { blobToDataUrl } from "../../core/runtime/buildPreviewAssetUrls";
import type { AspectRatio } from "../../core/types";

/** What a tile of the start screen shows of a module: its name and its first slide - read from the file without opening it. */
export interface ModuleSummary {
  title: string;
  /** width / height of the slide */
  aspect: number;
  /** The module's own page, set to show its first slide as a picture (nothing moves, nothing plays) - for an iframe's `srcDoc`. Null when
   * the file has no page to show. */
  html: string | null;
}

const DATA_TAG = /<script id="weft-data" type="application\/json">([\s\S]*?)<\/script>/;
const ASSET_URLS_TAG = /(<script id="weft-asset-urls" type="application\/json">)[\s\S]*?(<\/script>)/;
const RENDER_MODE_TAG = '<script id="weft-render-mode" type="application/json">{"all":true}</script>\n';
/** Pictures bigger than this are left out of the preview (the module's page shows its first slide without them): a tile does not
 * need - and the window should not hold - the whole of a large module. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export async function summarizeModule(bytes: Uint8Array): Promise<ModuleSummary> {
  const files = unzipSync(bytes, {
    filter: (file) => file.name === "index.html" || (file.name.startsWith("assets/") && IMAGE_EXTENSION.test(file.name) && file.originalSize <= MAX_IMAGE_BYTES),
  });
  const page = files["index.html"];
  if (!page) return { title: "", aspect: 16 / 9, html: null };
  let html = strFromU8(page);

  const data = DATA_TAG.exec(html);
  const module = data ? (JSON.parse(data[1]) as { title?: string; aspectRatio?: AspectRatio; assets?: { id: string; mimeType: string }[] }) : {};
  const mimeById = new Map((module.assets ?? []).map((asset) => [asset.id, asset.mimeType]));

  const urls: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith("assets/")) continue;
    // assets/<id>_<name>
    const name = path.slice("assets/".length);
    const separator = name.indexOf("_");
    if (separator <= 0) continue;
    const id = name.slice(0, separator);
    urls[id] = await blobToDataUrl(new Blob([content as BlobPart], { type: mimeById.get(id) ?? "application/octet-stream" }));
  }

  html = html.replace(ASSET_URLS_TAG, (_, open: string, close: string) => open + JSON.stringify(urls).replace(/</g, "\\u003c") + close);
  const marker = '<script id="weft-start-page"';
  html = html.includes(marker) ? html.replace(marker, RENDER_MODE_TAG + marker) : html;
  let aspect = 16 / 9;
  try {
    if (module.aspectRatio) aspect = aspectRatioNumeric(module.aspectRatio);
  } catch {
    // keep 16:9
  }
  return { title: module.title ?? "", aspect, html };
}
