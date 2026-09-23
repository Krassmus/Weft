import type { BlockPosition } from "../../../core/types";

export const MIN_SIZE_PERCENT = 3;

export type HandleId = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type CornerHandleId = "nw" | "ne" | "se" | "sw";

export const HANDLES: { id: HandleId; edges: { top?: true; right?: true; bottom?: true; left?: true } }[] = [
  { id: "nw", edges: { top: true, left: true } },
  { id: "n", edges: { top: true } },
  { id: "ne", edges: { top: true, right: true } },
  { id: "e", edges: { right: true } },
  { id: "se", edges: { bottom: true, right: true } },
  { id: "s", edges: { bottom: true } },
  { id: "sw", edges: { bottom: true, left: true } },
  { id: "w", edges: { left: true } },
];

/** Corner-only subset of HANDLES - images use just these (see BlockView.tsx), since an edge
 * handle can only stretch one axis, which would squish the picture. */
export const CORNER_HANDLES = HANDLES.filter((h): h is { id: CornerHandleId; edges: typeof h.edges } =>
  h.id === "nw" || h.id === "ne" || h.id === "se" || h.id === "sw",
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// Drag math (mouse pixels -> percent of stage) produces long float tails like
// 3.4902141003460208 that are meaningless past the first few digits at any real stage size -
// round every committed x/y/width/height to this many decimals so the position fields in the
// sidebar (see BlockPanel.tsx's PositionEditor) stay short without a separate display-only
// rounding step drifting out of sync with what's actually stored.
const POSITION_DECIMALS = 3;

function round(value: number): number {
  const factor = 10 ** POSITION_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function clampMove(start: BlockPosition, dxPercent: number, dyPercent: number): BlockPosition {
  const x = round(clamp(start.x + dxPercent, 0, 100 - start.width));
  const y = round(clamp(start.y + dyPercent, 0, 100 - start.height));
  return { ...start, x, y };
}

/**
 * Where a fractional anchor point (fx/fy, each -0.5..0.5 of width/height from the block's own
 * center - e.g. (0.5, 0.5) is the se corner, (0.5, 0) the e edge's midpoint) ends up on the stage
 * once the box is rotated around ITS OWN center, in real stage pixels.
 */
function anchorWorldPx(
  centerXPx: number,
  centerYPx: number,
  widthPx: number,
  heightPx: number,
  fx: number,
  fy: number,
  cos: number,
  sin: number,
): { x: number; y: number } {
  const lx = fx * widthPx;
  const ly = fy * heightPx;
  return { x: centerXPx + lx * cos - ly * sin, y: centerYPx + lx * sin + ly * cos };
}

/**
 * Resizing a rotated block by keeping one LOCAL edge/corner's unrotated x/y fixed (as plain,
 * unrotated resizing does) isn't enough once the block is actually rotated: CSS rotates the box
 * around its own center, and changing width/height moves that center - so the "fixed" local point
 * still drifts on screen unless the rotation is accounted for too. This instead keeps a chosen
 * anchor point (fx/fy - see anchorWorldPx) at the same screen position across the resize: it
 * finds where that anchor currently sits on the stage, then works out the new x/y (unrotated,
 * top-left) that puts the SAME anchor back at that exact spot once the box has its new
 * width/height. With rotation 0 this reduces to plain axis-aligned anchoring.
 */
function anchorResize(
  start: BlockPosition,
  fx: number,
  fy: number,
  newWidthPercent: number,
  newHeightPercent: number,
  stagePx: { width: number; height: number },
): { x: number; y: number } {
  const rad = ((start.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const w0 = (start.width / 100) * stagePx.width;
  const h0 = (start.height / 100) * stagePx.height;
  const cx0 = ((start.x + start.width / 2) / 100) * stagePx.width;
  const cy0 = ((start.y + start.height / 2) / 100) * stagePx.height;
  const anchor = anchorWorldPx(cx0, cy0, w0, h0, fx, fy, cos, sin);

  const w1 = (newWidthPercent / 100) * stagePx.width;
  const h1 = (newHeightPercent / 100) * stagePx.height;
  // The anchor's offset from the (still unknown) new center, at the new size - subtracting it
  // from the anchor's fixed world position below is what solves for that new center.
  const offset = anchorWorldPx(0, 0, w1, h1, fx, fy, cos, sin);
  const cx1 = anchor.x - offset.x;
  const cy1 = anchor.y - offset.y;

  return {
    x: ((cx1 - w1 / 2) / stagePx.width) * 100,
    y: ((cy1 - h1 / 2) / stagePx.height) * 100,
  };
}

export function resizeFromHandle(
  handle: HandleId,
  start: BlockPosition,
  stagePx: { width: number; height: number },
  dxPercent: number,
  dyPercent: number,
): BlockPosition {
  const edges = HANDLES.find((h) => h.id === handle)!.edges;
  let width = start.width;
  let height = start.height;

  if (edges.left) {
    width = clamp(start.width - dxPercent, MIN_SIZE_PERCENT, start.x + start.width);
  } else if (edges.right) {
    width = clamp(start.width + dxPercent, MIN_SIZE_PERCENT, 100 - start.x);
  }

  if (edges.top) {
    height = clamp(start.height - dyPercent, MIN_SIZE_PERCENT, start.y + start.height);
  } else if (edges.bottom) {
    height = clamp(start.height + dyPercent, MIN_SIZE_PERCENT, 100 - start.y);
  }

  // The anchor is whichever edge/corner is opposite the one being dragged - e.g. dragging the
  // right edge (only) anchors the left edge's midpoint (fx negative, fy 0, since height doesn't
  // change); dragging a corner anchors the opposite corner (both fx and fy set).
  const fx = edges.left ? 0.5 : edges.right ? -0.5 : 0;
  const fy = edges.top ? 0.5 : edges.bottom ? -0.5 : 0;
  const { x, y } = anchorResize(start, fx, fy, width, height, stagePx);

  return { ...start, x: round(x), y: round(y), width: round(width), height: round(height) };
}

/**
 * Corner-only resize that keeps the block's width/height ratio fixed - used for image blocks,
 * where free n/e/s/w edge resizing would stretch/squish the picture (see resizeFromHandle for
 * the general case). The opposite corner stays put, and the dragged corner always sits on the
 * straight line running through it and the fixed corner (the block's own diagonal) - the cursor's
 * movement is projected onto that line to find how far along it to go, rather than scaling by
 * whichever of width/height moved more, which would make the block overshoot the cursor at any
 * drag angle off that exact diagonal (e.g. a mostly-horizontal drag would previously also inflate
 * the height, so the corner shot past the cursor). Measured in real screen pixels, not raw
 * percent, so this is correct even when the stage itself isn't square.
 */
export function resizeCornerLocked(
  handle: CornerHandleId,
  start: BlockPosition,
  stagePx: { width: number; height: number },
  dxPercent: number,
  dyPercent: number,
): BlockPosition {
  const signX = handle === "ne" || handle === "se" ? 1 : -1;
  const signY = handle === "sw" || handle === "se" ? 1 : -1;

  const startWidthPx = (start.width / 100) * stagePx.width;
  const startHeightPx = (start.height / 100) * stagePx.height;
  const dxPx = (dxPercent / 100) * stagePx.width;
  const dyPx = (dyPercent / 100) * stagePx.height;

  const diagonalPx = Math.hypot(startWidthPx, startHeightPx);
  const unitX = startWidthPx / diagonalPx;
  const unitY = startHeightPx / diagonalPx;
  const movedAlongDiagonal = signX * dxPx * unitX + signY * dyPx * unitY;
  const rawScale = (diagonalPx + movedAlongDiagonal) / diagonalPx;

  const fixedX = signX === 1 ? start.x : start.x + start.width;
  const fixedY = signY === 1 ? start.y : start.y + start.height;
  const maxWidthPercent = signX === 1 ? 100 - fixedX : fixedX;
  const maxHeightPercent = signY === 1 ? 100 - fixedY : fixedY;

  const minScale = Math.max(MIN_SIZE_PERCENT / start.width, MIN_SIZE_PERCENT / start.height);
  const maxScale = Math.min(maxWidthPercent / start.width, maxHeightPercent / start.height);
  const scale = clamp(rawScale, minScale, maxScale);

  const width = start.width * scale;
  const height = start.height * scale;
  const { x, y } = anchorResize(start, -signX * 0.5, -signY * 0.5, width, height, stagePx);

  return { ...start, x: round(x), y: round(y), width: round(width), height: round(height) };
}

/**
 * A resize handle on a rotated block is still dragged in plain screen space, but
 * resizeFromHandle/resizeCornerLocked expect a delta along the block's own local width/height
 * axes (as if it weren't rotated at all) - this rotates a raw screen-pixel mouse delta backwards
 * by the block's own rotation to convert one into the other, so e.g. dragging straight down on a
 * block rotated 90° correctly reads as "along its local x axis", matching which edge visually
 * moved under the cursor. Done in real pixels, before any percent-of-stage conversion: percent of
 * stage width and percent of stage height are different units whenever the stage itself isn't
 * square, and rotating a vector only makes sense in a single, isotropic unit.
 */
export function unrotateDelta(dxPx: number, dyPx: number, rotationDeg: number): { dx: number; dy: number } {
  if (!rotationDeg) return { dx: dxPx, dy: dyPx };
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dxPx * cos + dyPx * sin, dy: dyPx * cos - dxPx * sin };
}

/** Distance in px from a point to the nearest edge of a rect - negative if the point is outside the rect. */
export function distanceToEdge(clientX: number, clientY: number, rect: DOMRect): number {
  const dxInside = Math.min(clientX - rect.left, rect.right - clientX);
  const dyInside = Math.min(clientY - rect.top, rect.bottom - clientY);
  return Math.min(dxInside, dyInside);
}
