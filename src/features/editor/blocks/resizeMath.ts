import type { BlockPosition } from "../../../core/types";

export const MIN_SIZE_PERCENT = 3;

export type HandleId = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

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

/** Distance in px from a point to the nearest edge of a rect - negative if the point is outside the rect. */
export function distanceToEdge(clientX: number, clientY: number, rect: DOMRect): number {
  const dxInside = Math.min(clientX - rect.left, rect.right - clientX);
  const dyInside = Math.min(clientY - rect.top, rect.bottom - clientY);
  return Math.min(dxInside, dyInside);
}
