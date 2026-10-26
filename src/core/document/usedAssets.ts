import type { Block, StaticBlock, WeftModule } from "../types";
import { placeholderSources } from "./variablePlaceholders";

/** The pictures behind the letters of the texts of a block (see data-weft-bg-asset in richText.ts). */
function textAssetIds(block: Block | StaticBlock): string[] {
  const ids: string[] = [];
  for (const html of placeholderSources(block as Block)) {
    if (!html.includes("data-weft-bg-asset")) continue;
    for (const match of html.matchAll(/data-weft-bg-asset="([^"]+)"/g)) ids.push(match[1]);
  }
  return ids;
}

function assetIdsOf(block: Block | StaticBlock): string[] {
  const inText = textAssetIds(block);
  if (inText.length > 0) return [...inText, ...assetIdsOfPlain(block)];
  return assetIdsOfPlain(block);
}

function assetIdsOfPlain(block: Block | StaticBlock): string[] {
  if (block.kind === "files") return block.files.map((file) => file.id);
  if (block.kind === "sort") return block.items.flatMap((item) => (item.kind === "image" && item.assetId ? [item.assetId] : []));
  if (block.kind === "matching") return [...block.sources, ...block.targets].flatMap((item) => (item.kind === "image" && item.assetId ? [item.assetId] : []));
  if (block.kind === "revealer") return block.imageAssetId ? [block.imageAssetId] : [];
  if (block.kind === "list") return block.marker === "image" && block.markerAssetId ? [block.markerAssetId] : [];
  return (block.kind === "image" || block.kind === "video" || block.kind === "audio") && block.assetId ? [block.assetId] : [];
}

/**
 * Every asset id an image, video or files block actually references right now, across every page and
 * every layout - the source of truth for which uploaded files are still part of the module.
 * `module.assets` itself can't be trusted for this: it's append-only (setBlockImage/
 * setBlockVideo push a new entry whenever a block's file is set or replaced, and removeBlock/
 * removeLayoutBlock never remove the old one), so a deleted block or a replaced file just
 * orphans its old asset entry forever rather than dropping it. Bundling or data-URI-encoding
 * every entry in `module.assets` regardless of use (as pack.ts and buildPreviewAssetUrls.ts used
 * to) is what let deleted/replaced videos silently balloon a saved module's size long after they
 * stopped being visible anywhere - both now filter through this first.
 */
export function usedAssetIds(module: WeftModule): Set<string> {
  const ids = new Set<string>();
  if (module.coverAssetId) ids.add(module.coverAssetId);
  for (const page of Object.values(module.pages)) {
    for (const block of Object.values(page.blocks)) {
      for (const id of assetIdsOf(block)) ids.add(id);
    }
    // The picture behind a wheel transition.
    for (const end of Object.values(page.timeline?.ends ?? {})) {
      const background = end.transition?.background;
      if (background?.kind === "image") ids.add(background.assetId);
    }
  }
  for (const layout of Object.values(module.layouts)) {
    for (const block of Object.values(layout.blocks)) {
      for (const id of assetIdsOf(block)) ids.add(id);
    }
  }
  return ids;
}
