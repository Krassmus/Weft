import type { CSSProperties } from "react";
import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { useDocumentStore } from "../../../core/document/store";
import type { ShapeBlock, ShapeGradient, ShapeStrokeStyle } from "../../../core/types";
import { pointsAttr, regularPolygonPoints, roundedRectPath, starOutlinePoints } from "./shapeGeometry";

/** One shared id per block, not per render - a gradient fill references it via `url(#...)`, and
 * it has to stay stable across re-renders for that reference to keep resolving. Blocks ids are
 * already unique per document, so no extra counter/uuid is needed here. */
export function shapeGradientId(blockId: string): string {
  return `weft-shape-fill-${blockId}`;
}

function hexToRgba(hex: string, opacity: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const [, r, g, b] = m;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${opacity})`;
}

/** "dashed"/"dotted" are expressed relative to the stroke's own width (cqw, see
 * ShapeStroke.width's doc comment) rather than a fixed length, so a thicker stroke gets
 * proportionally longer dashes/gaps instead of a fixed pattern that looks too fine or too coarse
 * next to it - exactly like a PowerPoint dash pattern scales with line weight. */
function strokeDashStyle(style: ShapeStrokeStyle, widthCqw: number): Pick<CSSProperties, "strokeDasharray" | "strokeLinecap"> {
  if (style === "dashed") return { strokeDasharray: `${widthCqw * 2.5}cqw ${widthCqw * 1.5}cqw`, strokeLinecap: "butt" };
  if (style === "dotted") return { strokeDasharray: `0.01cqw ${widthCqw * 2}cqw`, strokeLinecap: "round" };
  return {};
}

function GradientDef({ id, gradient }: { id: string; gradient: ShapeGradient }) {
  const stops = gradient.stops.map((s) => <stop key={s.id} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={s.opacity} />);
  if (gradient.kind === "radial") {
    return (
      <radialGradient id={id} cx="50%" cy="50%" r="50%">
        {stops}
      </radialGradient>
    );
  }
  // gradientUnits defaults to objectBoundingBox (a 0-1 space), so rotating around (0.5, 0.5) turns
  // the gradient around the shape's own center regardless of its actual rendered size.
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform={`rotate(${gradient.angle} 0.5 0.5)`}>
      {stops}
    </linearGradient>
  );
}

/**
 * Renders one ShapeBlock as an inline SVG - shared by BlockView.tsx (the editable canvas) and
 * SlideThumbnail.tsx, so fill/stroke/shadow behavior can't drift between the two. Always a single
 * fixed 0-100 viewBox stretched with preserveAspectRatio="none" to fill the block's own box (see
 * shapeGeometry.ts's own header comment) - the caller is responsible for sizing/positioning that
 * box (this component only ever fills 100% width/height of its parent) and, for the entrance/exit
 * animation case, for not clipping it: a shadow can extend past the shape's own bounding box, so
 * the parent needs `overflow: visible` for it to actually show (see .weft-edit-block-inner-shape
 * in App.css and .weft-block-shape in player.runtime.css).
 *
 * Hand-duplicated in player.runtime.js (vanilla JS, can't import from here - see that file's own
 * header comment) - keep the two in sync by hand for any change here.
 */
export function ShapeSvg({ block }: { block: ShapeBlock }) {
  const { shapeKind, fill, stroke, shadow } = block;
  const gradientId = shapeGradientId(block.id);
  // The block's own TRUE on-slide width:height ratio (not its position.width/position.height
  // alone, which are percent of the slide's own width and height respectively - different physical
  // scales unless the slide itself is square) - see roundedRectPath's own doc comment for why a
  // rounded rectangle's corners need this to stay circular instead of turning elliptical.
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const boxAspect = block.position.height > 0 ? (block.position.width / block.position.height) * slideAspect : 1;

  const fillValue = fill.type === "none" ? "none" : fill.type === "gradient" ? `url(#${gradientId})` : fill.color;
  const fillOpacity = fill.type === "solid" ? fill.opacity : undefined;

  const strokeStyle: CSSProperties = stroke.enabled
    ? {
        strokeWidth: `${stroke.width}cqw`,
        // Keeps the stroke's own visual weight tied to the slide's cqw scale instead of the
        // shape's local 0-100 viewBox, which would otherwise make it thicker/thinner - and, on a
        // non-square box, thicker on one axis than the other - purely from resizing the shape
        // itself. See ShapeStroke.width's own doc comment in core/types.ts.
        vectorEffect: "non-scaling-stroke",
        ...strokeDashStyle(stroke.style, stroke.width),
      }
    : {};

  const svgStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
    overflow: "visible",
    filter: shadow.enabled
      ? `drop-shadow(${shadow.offsetX}cqw ${shadow.offsetY}cqw ${shadow.blur}cqw ${hexToRgba(shadow.color, shadow.opacity)})`
      : undefined,
  };

  const shapeProps = {
    fill: fillValue,
    fillOpacity,
    stroke: stroke.enabled ? stroke.color : undefined,
    strokeOpacity: stroke.enabled ? stroke.opacity : undefined,
    style: strokeStyle,
  };

  let shape: React.ReactNode;
  if (shapeKind === "rectangle") {
    shape = <path d={roundedRectPath(block.cornerRadii, boxAspect)} {...shapeProps} />;
  } else if (shapeKind === "ellipse") {
    shape = <ellipse cx={50} cy={50} rx={50} ry={50} {...shapeProps} />;
  } else if (shapeKind === "polygon") {
    shape = <polygon points={pointsAttr(regularPolygonPoints(block.sides))} {...shapeProps} />;
  } else {
    shape = <polygon points={pointsAttr(starOutlinePoints(block.starPoints, block.starInnerRadius))} {...shapeProps} />;
  }

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
      {fill.type === "gradient" && (
        <defs>
          <GradientDef id={gradientId} gradient={fill.gradient} />
        </defs>
      )}
      {shape}
    </svg>
  );
}
