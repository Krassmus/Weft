import { strFromU8, unzipSync } from "fflate";
import { aspectRatioNumeric } from "../../core/aspectRatio";
import { blobToDataUrl } from "../../core/runtime/buildPreviewAssetUrls";
import type { AspectRatio } from "../../core/types";
import { LOGO_FILE } from "../../core/io/coverImage";
import { unpackDocument } from "../../core/io/unpack";
import { buildInlineFontFaceCss } from "../../core/runtime/buildInlineFontFaceCss";
import { buildRuntimeHtml } from "../../core/runtime/buildRuntimeHtml";

/** What a tile of the start screen shows of a module: its name and its first slide - read from the file without opening it. */
export interface ModuleSummary {
  title: string;
  /** width / height of the slide */
  aspect: number;
  /** The module's own page, set to show its first slide as a picture (nothing moves, nothing plays) - for an iframe's `srcDoc`. Null when
   * the file has no page to show. */
  html: string | null;
  /** The cover picture of the file (its logo.png) as a data: address - when it has one: that is what a tile shows then. */
  coverUrl: string | null;
}

const DATA_TAG = /<script id="weft-data" type="application\/json">([\s\S]*?)<\/script>/;
const ASSET_URLS_TAG = /(<script id="weft-asset-urls" type="application\/json">)[\s\S]*?(<\/script>)/;
const RENDER_MODE_TAG = '<script id="weft-render-mode" type="application/json">{"all":true}</script>\n';
/** Pictures bigger than this are left out of the preview (the module's page shows its first slide without them): a tile does not
 * need - and the window should not hold - the whole of a large module. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

/** The page set to show the first slide as a picture (nothing moves, nothing plays). */
function asPicture(html: string): string {
  const marker = '<script id="weft-start-page"';
  return html.includes(marker) ? html.replace(marker, RENDER_MODE_TAG + marker) : html;
}

/** A file without a page of its own (one that a tool like the `weft` command line wrote - only the page the app saves has it): the page is made
 * from the module itself, the way the app makes it when it saves. */
async function summarizeWithoutPage(bytes: Uint8Array, coverUrl: string | null): Promise<ModuleSummary> {
  try {
    const content = unpackDocument(bytes, { importAssets: false }).content;
    const files = unzipSync(bytes, {
      filter: (file) => file.name.startsWith("assets/") && IMAGE_EXTENSION.test(file.name) && file.originalSize <= MAX_IMAGE_BYTES,
    });
    const urls: Record<string, string> = {};
    for (const meta of content.assets) {
      const name = Object.keys(files).find((path) => path.startsWith(`assets/${meta.id}_`));
      if (name) urls[meta.id] = await blobToDataUrl(new Blob([files[name] as BlobPart], { type: meta.mimeType }));
    }
    const html = asPicture(await buildRuntimeHtml(content, urls, await buildInlineFontFaceCss(content)));
    let aspect = 16 / 9;
    try {
      aspect = aspectRatioNumeric(content.aspectRatio);
    } catch {
      // keep 16:9
    }
    return { title: content.title ?? "", aspect, html, coverUrl };
  } catch {
    return { title: "", aspect: 16 / 9, html: null, coverUrl };
  }
}

export async function summarizeModule(bytes: Uint8Array): Promise<ModuleSummary> {
  const files = unzipSync(bytes, {
    filter: (file) => file.name === "index.html" || file.name === LOGO_FILE || (file.name.startsWith("assets/") && IMAGE_EXTENSION.test(file.name) && file.originalSize <= MAX_IMAGE_BYTES),
  });
  const logo = files[LOGO_FILE];
  const coverUrl = logo ? await blobToDataUrl(new Blob([logo as BlobPart], { type: "image/png" })) : null;
  const page = files["index.html"];
  if (!page) return summarizeWithoutPage(bytes, coverUrl);
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
  html = asPicture(html);
  let aspect = 16 / 9;
  try {
    if (module.aspectRatio) aspect = aspectRatioNumeric(module.aspectRatio);
  } catch {
    // keep 16:9
  }
  return { title: module.title ?? "", aspect, html, coverUrl };
}
