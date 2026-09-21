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

export function clampMove(start: BlockPosition, dxPercent: number, dyPercent: number): BlockPosition {
  const x = clamp(start.x + dxPercent, 0, 100 - start.width);
  const y = clamp(start.y + dyPercent, 0, 100 - start.height);
  return { ...start, x, y };
}

export function resizeFromHandle(handle: HandleId, start: BlockPosition, dxPercent: number, dyPercent: number): BlockPosition {
  const edges = HANDLES.find((h) => h.id === handle)!.edges;
  let { x, y, width, height } = start;

  if (edges.left) {
    const rightEdge = start.x + start.width;
    x = clamp(start.x + dxPercent, 0, rightEdge - MIN_SIZE_PERCENT);
    width = rightEdge - x;
  } else if (edges.right) {
    width = clamp(start.width + dxPercent, MIN_SIZE_PERCENT, 100 - start.x);
  }

  if (edges.top) {
    const bottomEdge = start.y + start.height;
    y = clamp(start.y + dyPercent, 0, bottomEdge - MIN_SIZE_PERCENT);
    height = bottomEdge - y;
  } else if (edges.bottom) {
    height = clamp(start.height + dyPercent, MIN_SIZE_PERCENT, 100 - start.y);
  }

  return { x, y, width, height };
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
  return {
    x: signX === 1 ? fixedX : fixedX - width,
    y: signY === 1 ? fixedY : fixedY - height,
    width,
    height,
  };
}

/** Distance in px from a point to the nearest edge of a rect - negative if the point is outside the rect. */
export function distanceToEdge(clientX: number, clientY: number, rect: DOMRect): number {
  const dxInside = Math.min(clientX - rect.left, rect.right - clientX);
  const dyInside = Math.min(clientY - rect.top, rect.bottom - clientY);
  return Math.min(dxInside, dyInside);
}
