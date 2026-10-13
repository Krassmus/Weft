import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { useDocumentStore } from "../../../core/document/store";
import type { ArrowBlock } from "../../../core/types";
import { arrowSvgMarkup } from "../../../core/runtime/arrowGeometry.js";

/** The block's real width : height on the slide (see arrowGeometry.js) - the same figure ShapeSvg works out. */
export function useArrowBoxAspect(block: Pick<ArrowBlock, "position">): number {
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  return block.position.height > 0 ? (block.position.width / block.position.height) * slideAspect : 1;
}

/**
 * One ArrowBlock as an inline SVG - shared by the canvas (BlockView.tsx) and the thumbnails
 * (SlideThumbnail.tsx). The drawing itself is arrowGeometry.js, which the exported player embeds too, so
 * what is drawn here is what the learner sees. Fills 100% of its parent (the block's box); the SVG
 * overflows it (the line and its head may reach beyond the waypoints' box), so the parent must not clip.
 */
export function ArrowSvg({ block, exportPxPerCqw }: { block: ArrowBlock; exportPxPerCqw?: number }) {
  const boxAspect = useArrowBoxAspect(block);
  let markup: string = arrowSvgMarkup(block, boxAspect);
  // Drawn on its own (as a picture, for the PDF) a "cqw" has no container to refer to: lengths are written in px then.
  if (exportPxPerCqw) markup = markup.replace(/(-?[\d.]+)cqw/g, (_, n: string) => `${Math.round(parseFloat(n) * exportPxPerCqw * 1000) / 1000}px`);
  return <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: markup }} />;
}
