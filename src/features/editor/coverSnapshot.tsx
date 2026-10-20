import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { useAssetStore } from "../../core/assets/assetStore";
import { aspectRatioNumeric } from "../../core/aspectRatio";
import { eventTimes } from "../../core/document/readingOrder";
import { blockEffectNodeId } from "../../core/document/pageTimeline";
import { orderedValues } from "../../core/document/ordering";
import { setCoverRenderer } from "../../core/io/coverImage";
import type { CoverRenderer } from "../../core/io/coverImage";
import type { Block, WeftModule } from "../../core/types";
import { blobToDataUrl, pagesInPlayingOrder, whenSettled } from "./exportPdf";
import { SlideThumbnail } from "./SlideThumbnail";

/** The width the picture of the first slide is drawn at (the height follows from the module's shape). */
const COVER_WIDTH_PX = 800;

/**
 * What stands on a page once everything that happens by itself has happened and nothing has been clicked: the layout's blocks, the page's
 * blocks that have no Aufbau or whose Aufbau comes by itself (a trigger from the start of the page, with or without a delay, and not one
 * that waits for Weiter or for the learner), minus the ones whose Abbau comes by itself.
 */
export function blocksAtRest(content: WeftModule, pageId: string): Block[] {
  const page = content.pages[pageId];
  const layout = page.layoutId ? content.layouts[page.layoutId] : null;
  const times = eventTimes(page, layout);
  const byItself = (id: string) => times.get(id)?.[0] === 0;
  const pageBlocks = orderedValues(page.blocks).filter((block) => {
    if (block.kind === "script") return false;
    if (block.entranceEffect.type !== "off" && !byItself(blockEffectNodeId(block.id, "entrance"))) return false;
    if (block.exitEffect.type !== "off" && byItself(blockEffectNodeId(block.id, "exit"))) return false;
    return true;
  });
  return [...orderedValues(layout?.blocks ?? {}), ...pageBlocks];
}

/** The picture of the first slide at rest as a PNG - what a module without a cover picture has as logo.png. */
const renderer: CoverRenderer = {
  keyOf(content) {
    const pageId = pagesInPlayingOrder(content)[0];
    if (!pageId) return null;
    const page = content.pages[pageId];
    return JSON.stringify([content.aspectRatio, page.blocks, page.timeline, page.layoutId ? content.layouts[page.layoutId]?.blocks : null]);
  },
  async render(content) {
    const pageId = pagesInPlayingOrder(content)[0];
    if (!pageId) return null;
    const blocks = blocksAtRest(content, pageId);
    const aspect = aspectRatioNumeric(content.aspectRatio);
    const holder = document.createElement("div");
    // Off the screen, but laid out (a slide that is not displayed has no size to draw).
    holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${COVER_WIDTH_PX}px;pointer-events:none;`;
    holder.className = "weft-pdf-export";
    document.body.appendChild(holder);
    const root = createRoot(holder);
    try {
      const imageUrls: Record<string, string> = {};
      for (const block of blocks) {
        if (block.kind !== "image" || !block.assetId || (!block.mask && !block.effect)) continue;
        const blob = useAssetStore.getState().blobs.get(block.assetId);
        if (blob) imageUrls[block.id] = await blobToDataUrl(blob);
      }
      flushSync(() => root.render(<SlideThumbnail blocks={blocks} pageId={pageId} exportPxPerCqw={COVER_WIDTH_PX / 100} imageUrls={imageUrls} />));
      await whenSettled(holder);
      const canvas = await html2canvas(holder, {
        scale: 1,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        width: COVER_WIDTH_PX,
        height: Math.round(COVER_WIDTH_PX / aspect),
      });
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      root.unmount();
      holder.remove();
    }
  },
};

setCoverRenderer(renderer);
