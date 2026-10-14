import type { ImageMask, ImageMaskPoint, ImageMaskShape } from "../types";
import { imageMaskSegmentMiddles } from "../runtime/imageGeometry.js";

/**
 * The masks of images (ImageBlock.mask): the starting shapes and what the editor does to a mask's points. The drawing itself is
 * runtime/imageGeometry.js. Points are percent of the picture's box; a shape that has to be round in the slide (a circle, a star)
 * is worked out with the box's real width : height (`boxAspect`), so it is round - and from then on it is just points.
 */

export const IMAGE_MASK_SHAPES: { id: ImageMaskShape; label: string }[] = [
  { id: "rectangle", label: "Rechteck" },
  { id: "rounded", label: "Abgerundet" },
  { id: "circle", label: "Kreis" },
  { id: "ellipse", label: "Ellipse" },
  { id: "triangle", label: "Dreieck" },
  { id: "star", label: "Stern" },
];

/** How far in from the picture's edges a new mask begins, in percent: so that it can be seen and its points can be reached. */
const INSET = 6;
/** The rounding of the "Abgerundet" start, as percent of the box's width. */
const ROUNDED_RADIUS = 12;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export function defaultMask(shape: ImageMaskShape, boxAspect: number): ImageMask {
  const aspect = boxAspect > 0 ? boxAspect : 1;
  const lo = INSET;
  const hi = 100 - INSET;
  let points: ImageMaskPoint[];
  if (shape === "rectangle") {
    points = [
      { x: lo, y: lo },
      { x: hi, y: lo },
      { x: hi, y: hi },
      { x: lo, y: hi },
    ];
  } else if (shape === "rounded") {
    points = [
      { x: lo, y: lo, radius: ROUNDED_RADIUS },
      { x: hi, y: lo, radius: ROUNDED_RADIUS },
      { x: hi, y: hi, radius: ROUNDED_RADIUS },
      { x: lo, y: hi, radius: ROUNDED_RADIUS },
    ];
  } else if (shape === "ellipse") {
    points = ring(8, 50, 50, (100 - 2 * INSET) / 2, (100 - 2 * INSET) / 2, true);
  } else if (shape === "circle") {
    // A circle in the slide: as wide as the shorter side of the box (in true space the box is 100 x 100 / aspect).
    const diameter = Math.min(100, 100 / aspect) * (1 - (2 * INSET) / 100);
    points = ring(8, 50, 50, diameter / 2, (diameter / 2) * aspect, true);
  } else if (shape === "triangle") {
    points = [
      { x: 50, y: lo },
      { x: hi, y: hi },
      { x: lo, y: hi },
    ];
  } else {
    const radius = Math.min(50, 50 / aspect) * (1 - (2 * INSET) / 100);
    points = ring(10, 50, 50, radius, radius * aspect, false).map((p, i) => {
      if (i % 2 === 0) return p;
      // The inner points of the star sit closer to the middle.
      return { x: 50 + (p.x - 50) * 0.42, y: 50 + (p.y - 50) * 0.42 };
    });
  }
  return { shape, points: points.map((p) => ({ ...p, x: round(p.x), y: round(p.y) })) };
}

/** `count` points around (cx, cy), the first at the top. rx/ry in percent. */
function ring(count: number, cx: number, cy: number, rx: number, ry: number, smooth: boolean): ImageMaskPoint[] {
  const points: ImageMaskPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const point: ImageMaskPoint = { x: cx + rx * Math.sin(angle), y: cy - ry * Math.cos(angle) };
    if (smooth) point.smooth = true;
    points.push(point);
  }
  return points;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The mask's points moved and scaled: `box` (percent) is the box around them before, `to` the box they are fitted into. */
export function fitPoints(points: ImageMaskPoint[], from: Box, to: Box): ImageMaskPoint[] {
  const sx = from.width > 0.001 ? to.width / from.width : 1;
  const sy = from.height > 0.001 ? to.height / from.height : 1;
  return points.map((p) => ({
    ...p,
    x: round(clampPercent(to.x + (p.x - from.x) * sx)),
    y: round(clampPercent(to.y + (p.y - from.y) * sy)),
  }));
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointsBox(points: ImageMaskPoint[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** All points shifted by (dx, dy) percent - never so far that one would leave the picture. */
export function movePoints(points: ImageMaskPoint[], dx: number, dy: number): ImageMaskPoint[] {
  const box = pointsBox(points);
  const sx = Math.min(Math.max(dx, -box.x), 100 - (box.x + box.width));
  const sy = Math.min(Math.max(dy, -box.y), 100 - (box.y + box.height));
  return points.map((p) => ({ ...p, x: round(p.x + sx), y: round(p.y + sy) }));
}

/** A new point on the curve after point `index` (where its "+" is). It is smooth if both its neighbours are. */
export function insertPointAfter(points: ImageMaskPoint[], index: number, boxAspect: number): ImageMaskPoint[] {
  const middle = imageMaskSegmentMiddles(points, boxAspect)[index];
  if (!middle) return points;
  const next = points[(index + 1) % points.length];
  const point: ImageMaskPoint = { x: round(clampPercent(middle.x)), y: round(clampPercent(middle.y)) };
  if (points[index].smooth && next.smooth) point.smooth = true;
  return [...points.slice(0, index + 1), point, ...points.slice(index + 1)];
}

/** A point turned from a corner into a smooth one and back. */
export function toggleSmooth(points: ImageMaskPoint[], index: number): ImageMaskPoint[] {
  return points.map((p, i) => {
    if (i !== index) return p;
    if (p.smooth) {
      const { smooth: _smooth, ...rest } = p;
      return rest;
    }
    const { radius: _radius, ...rest } = p;
    return { ...rest, smooth: true };
  });
}

/** The rounding of a corner. Which points: `index`, or every corner when it is null. */
export function setRadius(points: ImageMaskPoint[], index: number | null, radius: number): ImageMaskPoint[] {
  return points.map((p, i) => {
    if (p.smooth || (index !== null && i !== index)) return p;
    if (radius <= 0) {
      const { radius: _radius, ...rest } = p;
      return rest;
    }
    return { ...p, radius: round(radius) };
  });
}

export function removePoint(points: ImageMaskPoint[], index: number): ImageMaskPoint[] {
  return points.length <= 3 ? points : points.filter((_, i) => i !== index);
}
