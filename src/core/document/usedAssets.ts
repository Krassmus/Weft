import type { Block, Page, StaticBlock, WeftModule } from "../types";
import { assetIdsOfFields, descriptorOf } from "../blocks/registry";
import { branchPageIds, sequenceOf } from "./sequence";
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
  // (A block that describes itself - see core/blocks - says which of its fields are files.)
  if (descriptorOf(block)) return assetIdsOfFields(block as Block);
  return [];
}

/**
 * The pages that are part of the module: the ones in its sequence and in the branches of the logic blocks in it. A page that was deleted (see removePage in
 * actions.ts: it takes the page out of the sequence or its branch, not out of `pages` - so that undoing it, or a copy of the file that still has the page, finds it
 * whole) is not: the player never shows it, a button can not lead to it. Without a sequence (a module that was not read as one) every page counts.
 */
export function placedPages(module: Pick<WeftModule, "sequence" | "logicBlocks" | "pages">): Page[] {
  if (!module.sequence) return Object.values(module.pages);
  const ids = new Set<string>();
  for (const entry of sequenceOf(module)) {
    if (entry.kind === "page") ids.add(entry.pageId);
    else for (const branch of module.logicBlocks?.[entry.logicBlockId]?.branches ?? []) for (const pageId of branchPageIds(branch)) ids.add(pageId);
  }
  return [...ids].map((id) => module.pages[id]).filter((page): page is Page => !!page);
}

/**
 * The module as the player plays it: without the pages that were deleted (see placedPages) - the player would only carry their blocks, texts and highlighted
 * code, typeset formulas and fonts along. The same module if it has none.
 */
export function withoutDeletedPages<M extends Pick<WeftModule, "sequence" | "logicBlocks" | "pages">>(module: M): M {
  const placed = placedPages(module);
  if (placed.length === Object.keys(module.pages).length) return module;
  return { ...module, pages: Object.fromEntries(placed.map((page) => [page.id, page])) };
}

/**
 * Every asset id an image, video or files block actually references right now, across every page of the module (not the deleted ones: see placedPages) and
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
  for (const page of placedPages(module)) {
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
