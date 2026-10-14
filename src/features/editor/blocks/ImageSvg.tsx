import { useId } from "react";
import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { useDocumentStore } from "../../../core/document/store";
import type { ImageBlock } from "../../../core/types";
import { imageSvgMarkup } from "../../../core/runtime/imageGeometry.js";

/** The block's real width : height on the slide (see imageGeometry.js) - the same figure ShapeSvg works out. */
export function useImageBoxAspect(block: Pick<ImageBlock, "position">): number {
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  return block.position.height > 0 ? (block.position.width / block.position.height) * slideAspect : 1;
}

/**
 * An ImageBlock that has a mask and/or an effect - shared by the canvas (BlockView.tsx) and the thumbnails (SlideThumbnail.tsx). The
 * drawing itself is imageGeometry.js, which the exported player embeds too, so what is drawn here is what the learner sees. Fills
 * its parent (the block's box); the SVG reaches past it where an effect needs room, so the parent must not clip.
 *
 * `ghost`: while the mask is being edited, the part that is cut off shows faintly behind it.
 */
export function ImageSvg({ block, src, ghost }: { block: ImageBlock; src: string; ghost?: boolean }) {
  const boxAspect = useImageBoxAspect(block);
  const uid = useId();
  const markup = imageSvgMarkup(block, boxAspect, src, `${block.id}-${uid}`);
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {ghost && <img src={src} alt="" draggable={false} className="weft-edit-block-image weft-edit-block-image-ghost" />}
      <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
}
