import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { drawSlide } from "./exportCanvas";
import QRCode from "qrcode";
import { useAssetStore } from "../../core/assets/assetStore";
import { orderedValues } from "../../core/document/ordering";
import { branchPageIds, sequenceOf } from "../../core/document/sequence";
import { aspectRatioNumeric } from "../../core/aspectRatio";
import { buildImagePdf } from "../../core/io/pdfWriter";
import type { PdfImagePage } from "../../core/io/pdfWriter";
import type { Block, WeftModule } from "../../core/types";
import { SlideThumbnail } from "./SlideThumbnail";
import { tr } from "../../core/i18n/tr";

/** The width a slide is drawn at before it becomes a picture (the height follows from the module's shape). */
const RENDER_WIDTH_PX = 1280;
/** How much sharper than that the picture is. */
const RENDER_SCALE = 1.5;
const JPEG_QUALITY = 0.9;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The pages of the module in the order they are played: the main sequence, with the pages of each branch where the branch is. A
 * jump page has no content of its own and is left out. */
export function pagesInPlayingOrder(content: WeftModule): string[] {
  const ids: string[] = [];
  for (const entry of sequenceOf(content)) {
    if (entry.kind === "page") ids.push(entry.pageId);
    else {
      for (const branch of content.logicBlocks[entry.logicBlockId]?.branches ?? []) ids.push(...branchPageIds(branch));
    }
  }
  return ids.filter((id) => content.pages[id] && !content.pages[id].jump);
}

export function blocksOf(content: WeftModule, pageId: string): Block[] {
  const page = content.pages[pageId];
  const layout = page.layoutId ? content.layouts[page.layoutId] : undefined;
  return [...orderedValues(layout?.blocks ?? {}), ...orderedValues(page.blocks)];
}

// (A timer too: a window that is hidden or in the background never gets its animation frames.)
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 120);
  });

/** Everything a drawn slide waits for before it can be photographed: its images, and a video's first picture. */
export async function whenSettled(container: HTMLElement): Promise<void> {
  await Promise.all(
    Array.from(container.querySelectorAll("img")).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
  );
  await Promise.all(
    Array.from(container.querySelectorAll("video")).map(
      (video) =>
        new Promise<void>((resolve) => {
          if (video.readyState >= 2) return resolve();
          const done = () => resolve();
          video.addEventListener("loadeddata", done, { once: true });
          video.addEventListener("error", done, { once: true });
          setTimeout(done, 4000);
          video.preload = "auto";
          video.load();
        }),
    ),
  );
  if (document.fonts?.ready) await document.fonts.ready;
  await nextFrame();
}

/**
 * The PDF of the whole module: every page in the order it is played, one picture per page - drawn the way the page's thumbnail is (its
 * layout and its blocks in their end state: everything visible, a quiz with its answers, a video's first picture), at a size of its
 * own. Not what a learner would see after clicking - a page with an Aufbau shows the end of it.
 */
export async function exportModuleAsPdf(
  content: WeftModule,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const pageIds = pagesInPlayingOrder(content);
  const aspect = aspectRatioNumeric(content.aspectRatio);
  const holder = document.createElement("div");
  // Off the screen, but laid out (a slide that is not displayed has no size to draw).
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${RENDER_WIDTH_PX}px;pointer-events:none;`;
  holder.className = "weft-pdf-export";
  document.body.appendChild(holder);
  const root = createRoot(holder);
  const pages: PdfImagePage[] = [];
  try {
    for (let i = 0; i < pageIds.length; i++) {
      onProgress?.(i, pageIds.length);
      const blocks = blocksOf(content, pageIds[i]);
      // The QR codes of the embedded pages on this page.
      const qrSvgs: Record<string, string> = {};
      for (const block of blocks) {
        if (block.kind !== "iframe" || !block.url) continue;
        try {
          qrSvgs[block.id] = await QRCode.toString(block.url, { type: "svg", margin: 0 });
        } catch {
          // too long for a QR code: the address as text is there anyway
        }
      }
      // The pictures that have a mask or an effect, as data: addresses (see SlideThumbnail's imageUrls).
      const imageUrls: Record<string, string> = {};
      for (const block of blocks) {
        if (block.kind !== "image" || !block.assetId || (!block.mask && !block.effect)) continue;
        const blob = useAssetStore.getState().blobs.get(block.assetId);
        if (blob) imageUrls[block.id] = await blobToDataUrl(blob);
      }
      const canvas = await drawSlide(
        holder,
        blocks,
        async (shown, backdrops) => {
          flushSync(() => root.render(<SlideThumbnail blocks={shown} pageId={pageIds[i]} exportPxPerCqw={RENDER_WIDTH_PX / 100} qrSvgs={qrSvgs} imageUrls={imageUrls} backdrops={backdrops} />));
          await whenSettled(holder);
        },
        { scale: RENDER_SCALE, width: RENDER_WIDTH_PX, height: Math.round(RENDER_WIDTH_PX / aspect) },
      );
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!blob) throw new Error(tr("ui.a_slide_could_not_be_turned"));
      // The addresses on the page are links (where they stand in the picture).
      const holderRect = holder.getBoundingClientRect();
      const links = Array.from(holder.querySelectorAll<HTMLElement>("[data-pdf-link]")).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: (r.left - holderRect.left) / holderRect.width,
          y: (r.top - holderRect.top) / holderRect.height,
          width: r.width / holderRect.width,
          height: r.height / holderRect.height,
          url: el.getAttribute("data-pdf-link") ?? "",
        };
      });
      pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth: canvas.width, pixelHeight: canvas.height, links });
    }
    onProgress?.(pageIds.length, pageIds.length);
  } finally {
    root.unmount();
    holder.remove();
  }
  if (pages.length === 0) throw new Error(tr("ui.the_learning_module_has_no_slides"));
  return buildImagePdf(pages, content.title);
}
