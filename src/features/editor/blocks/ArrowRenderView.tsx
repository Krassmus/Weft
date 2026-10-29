import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { renderArrow } from "../../../core/blocks/arrow/render.js";
import type { ArrowRenderContext, ArrowRenderProps } from "../../../core/blocks/arrow/render.js";
import { useDocumentStore } from "../../../core/document/store";
import type { ArrowBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/** The block's real width : height on the slide (see render.js of the arrow) - what the shape works out as well. */
export function useArrowBoxAspect(block: Pick<ArrowBlock, "position">): number {
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  return block.position.height > 0 ? (block.position.width / block.position.height) * slideAspect : 1;
}

/**
 * An arrow as it is drawn on the canvas, in the thumbnails and in the PDF: by the function the player draws it with (blocks/arrow/render.js). It fills
 * the block's box and does not clip (the line and its head may reach past the waypoints' box).
 */
export function ArrowRenderView({ block, mode }: { block: ArrowBlock; mode: ArrowRenderContext["mode"] }) {
  const boxAspect = useArrowBoxAspect(block);
  const props: ArrowRenderProps = {
    block: { id: block.id, position: block.position, points: block.points, arrowStyle: block.arrowStyle, color: block.color, width: block.width, startHead: block.startHead, endHead: block.endHead },
    boxAspect,
  };
  return <RenderHost render={renderArrow} props={props} ctx={{ mode }} className="is-overflowing" />;
}
