import type { Block, StaticBlock, WeftModule } from "../types";

function assetIdOf(block: Block | StaticBlock): string | null {
  return block.kind === "image" || block.kind === "video" ? block.assetId : null;
}

/**
 * Every asset id an image or video block actually references right now, across every page and
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
  for (const page of Object.values(module.pages)) {
    for (const block of Object.values(page.blocks)) {
      const id = assetIdOf(block);
      if (id) ids.add(id);
    }
  }
  for (const layout of Object.values(module.layouts)) {
    for (const block of Object.values(layout.blocks)) {
      const id = assetIdOf(block);
      if (id) ids.add(id);
    }
  }
  return ids;
}
