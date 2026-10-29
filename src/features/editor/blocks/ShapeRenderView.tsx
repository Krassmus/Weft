import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { renderShape } from "../../../core/blocks/shape/render.js";
import type { ShapeRenderContext, ShapeRenderProps } from "../../../core/blocks/shape/render.js";
import { useDocumentStore } from "../../../core/document/store";
import type { ShapeBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A shape as it is drawn on the canvas, in the thumbnails and in the PDF: by the function the player draws it with (blocks/shape/render.js). The block's
 * box is given by the caller - this fills all of it, and does not clip (a shadow reaches past the shape). `exportPxPerCqw` and `bleedCqw` are for the PDF,
 * where the shape is drawn on its own as a picture (see the header of render.js).
 */
export function ShapeRenderView({ block, mode, exportPxPerCqw, bleedCqw }: { block: ShapeBlock; mode: ShapeRenderContext["mode"]; exportPxPerCqw?: number; bleedCqw?: number }) {
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const props: ShapeRenderProps = {
    block: {
      id: block.id,
      shapeKind: block.shapeKind,
      cornerRadii: block.cornerRadii,
      sides: block.sides,
      starPoints: block.starPoints,
      starInnerRadius: block.starInnerRadius,
      fill: block.fill,
      stroke: block.stroke,
      shadow: block.shadow,
      position: { width: block.position.width, height: block.position.height },
    },
    slideAspect,
  };
  return <RenderHost render={renderShape} props={props} ctx={{ mode, pxPerCqw: exportPxPerCqw, bleedCqw }} className="is-overflowing" />;
}
