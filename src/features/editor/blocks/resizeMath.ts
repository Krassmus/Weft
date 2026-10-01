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

export function round(value: number): number {
  const factor = 10 ** POSITION_DECIMALS;
  return Math.round(value * factor) / factor;
}

// How far past the slide's own edge a move-drag can push a block, in percent of the stage's own
// width/height - like Keynote/PowerPoint's own pasteboard area around the slide, this is deliberately
// generous rather than unbounded, mostly so a stray drag can't push a block so far away it's
// effectively lost (it's always still reachable through its exact x/y in the sidebar either way,
// but "scroll and/or zoom out until you spot it again" should stay realistic). Resizing is NOT
// given the same allowance (resizeFromHandle/resizeCornerLocked still clamp to the slide itself) -
// only a plain move does, per the feature this was added for.
const OFF_STAGE_MARGIN_PERCENT = 100;

function moveBounds(sizePercent: number): { min: number; max: number } {
  return { min: -OFF_STAGE_MARGIN_PERCENT, max: 100 + OFF_STAGE_MARGIN_PERCENT - sizePercent };
}

export function clampMove(start: BlockPosition, dxPercent: number, dyPercent: number): BlockPosition {
  const xBounds = moveBounds(start.width);
  const yBounds = moveBounds(start.height);
  const x = round(clamp(start.x + dxPercent, xBounds.min, xBounds.max));
  const y = round(clamp(start.y + dyPercent, yBounds.min, yBounds.max));
  return { ...start, x, y };
}

/** clampMove's own per-block bounds (see moveBounds/OFF_STAGE_MARGIN_PERCENT above), generalized
 * to clamp ONE shared delta against every member of a group at once - a group drag has to stop as
 * soon as the tightest (least permissive) of its members would go further off-stage than
 * clampMove ever allows a lone block to, so dragging a group can't push some of its members
 * arbitrarily far past the single-block limit. Clamping each position's bounds in sequence onto
 * the running delta is equivalent to intersecting every position's own allowed delta range,
 * since clamp() is monotonic - the loop just computes that intersection one position at a time. */
export function clampGroupMove(positions: BlockPosition[], dxPercent: number, dyPercent: number): { dx: number; dy: number } {
  let dx = dxPercent;
  let dy = dyPercent;
  for (const position of positions) {
    const xBounds = moveBounds(position.width);
    const yBounds = moveBounds(position.height);
    dx = clamp(position.x + dx, xBounds.min, xBounds.max) - position.x;
    dy = clamp(position.y + dy, yBounds.min, yBounds.max) - position.y;
  }
  return { dx: round(dx), dy: round(dy) };
}

/** The axis-aligned union box around every member of a group - individual members' own rotation
 * is ignored here (same approximation the group's own selection outline/resize overlay uses on
 * the canvas; each member keeps its own rotation untouched by a group resize, only its
 * x/y/width/height scale - see scalePositionWithinBox). Returned as a plain BlockPosition
 * (rotation 0) so it can be fed straight into resizeFromHandle/clampMove exactly like any other
 * block's position - no separate resize math is needed for the group's own virtual box. */
export function groupBoundingBox(positions: BlockPosition[]): BlockPosition {
  const left = Math.min(...positions.map((p) => p.x));
  const top = Math.min(...positions.map((p) => p.y));
  const right = Math.max(...positions.map((p) => p.x + p.width));
  const bottom = Math.max(...positions.map((p) => p.y + p.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Re-expresses `position` as the same fraction of `newBox` that it was of `oldBox` - the
 * proportional (Keynote-style) scaling a group resize applies to every member, driven by the
 * group's own virtual bounding box shrinking/growing via the usual resizeFromHandle. A member's
 * own rotation is left untouched; only its x/y/width/height move. */
export function scalePositionWithinBox(position: BlockPosition, oldBox: BlockPosition, newBox: BlockPosition): BlockPosition {
  const relX = oldBox.width === 0 ? 0 : (position.x - oldBox.x) / oldBox.width;
  const relY = oldBox.height === 0 ? 0 : (position.y - oldBox.y) / oldBox.height;
  const relWidth = oldBox.width === 0 ? 0 : position.width / oldBox.width;
  const relHeight = oldBox.height === 0 ? 0 : position.height / oldBox.height;
  return {
    ...position,
    x: round(newBox.x + relX * newBox.width),
    y: round(newBox.y + relY * newBox.height),
    width: round(relWidth * newBox.width),
    height: round(relHeight * newBox.height),
  };
}

/** How close (in real screen pixels, converted to percent per axis below) a dragged edge/center
 * has to get to a candidate line before it snaps - small enough to stay out of the way until the
 * user is clearly lining something up, per Keynote's own "smart guides" feel. */
const SNAP_PX = 6;

export interface SnapResult {
  position: BlockPosition;
  /** Percent-of-stage position of the matched vertical/horizontal guide line, or null if that
   * axis didn't snap to anything this move - BlockView draws a line at exactly this position. */
  guideX: number | null;
  guideY: number | null;
}

/** The single closest candidate (if any, within `threshold`) among every point/candidate pair -
 * only one snap per axis, so two nearby candidates can't fight over the same edge. */
function closestSnap(points: number[], candidates: number[], threshold: number): { delta: number; candidate: number } | null {
  let best: { delta: number; candidate: number } | null = null;
  for (const point of points) {
    for (const candidate of candidates) {
      const delta = candidate - point;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, candidate };
      }
    }
  }
  return best;
}

/** Every line worth snapping to on each axis - the stage's own center/edges, plus the left/
 * center/right (and top/middle/bottom) of every other block on the slide. Shared by move and
 * resize snapping alike. */
function snapCandidates(siblings: BlockPosition[]): { x: number[]; y: number[] } {
  const x = [0, 50, 100];
  const y = [0, 50, 100];
  for (const s of siblings) {
    x.push(s.x, s.x + s.width / 2, s.x + s.width);
    y.push(s.y, s.y + s.height / 2, s.y + s.height);
  }
  return { x, y };
}

/**
 * Keynote-style "smart guides" for a plain move (not resize, and not attempted at all for a
 * rotated block - see the caller) - snaps the dragged block's left/center/right (and top/middle/
 * bottom) toward the stage's own center/edges and toward the same three lines on every other
 * block on the slide (siblings), whichever single candidate per axis is closest and within
 * SNAP_PX. Operates in the same percent-of-stage space clampMove already produced `committed` in,
 * so this is meant to run right after it, not instead of it.
 */
export function snapMove(committed: BlockPosition, siblings: BlockPosition[], stagePx: { width: number; height: number }): SnapResult {
  const thresholdX = (SNAP_PX / stagePx.width) * 100;
  const thresholdY = (SNAP_PX / stagePx.height) * 100;

  const xPoints = [committed.x, committed.x + committed.width / 2, committed.x + committed.width];
  const yPoints = [committed.y, committed.y + committed.height / 2, committed.y + committed.height];
  const { x: xCandidates, y: yCandidates } = snapCandidates(siblings);

  const snapX = closestSnap(xPoints, xCandidates, thresholdX);
  const snapY = closestSnap(yPoints, yCandidates, thresholdY);

  // Same bounds as clampMove (not the plain 0/100 stage edge) - otherwise snapping a block that's
  // already off-stage back onto some candidate line would also silently yank it back on-stage.
  const xBounds = moveBounds(committed.width);
  const yBounds = moveBounds(committed.height);
  const x = snapX ? clamp(round(committed.x + snapX.delta), xBounds.min, xBounds.max) : committed.x;
  const y = snapY ? clamp(round(committed.y + snapY.delta), yBounds.min, yBounds.max) : committed.y;

  return {
    position: { ...committed, x, y },
    guideX: snapX ? snapX.candidate : null,
    guideY: snapY ? snapY.candidate : null,
  };
}

/**
 * The same smart guides for a free (non-aspect-locked) resize - not attempted for a rotated block,
 * same reasoning as snapMove. Only the edge(s) the handle actually drags get a chance to snap (an
 * "e" handle only ever moves the right edge, a corner handle both its edges); the opposite edge(s)
 * stay exactly where resizeFromHandle already anchored them, growing/shrinking the width or height
 * to match whatever the snapped edge lands on. Meant to run right after resizeFromHandle, on its
 * result.
 */
export function snapResize(
  committed: BlockPosition,
  edges: { top?: true; right?: true; bottom?: true; left?: true },
  siblings: BlockPosition[],
  stagePx: { width: number; height: number },
): SnapResult {
  const thresholdX = (SNAP_PX / stagePx.width) * 100;
  const thresholdY = (SNAP_PX / stagePx.height) * 100;
  const { x: xCandidates, y: yCandidates } = snapCandidates(siblings);

  let x = committed.x;
  let width = committed.width;
  let guideX: number | null = null;
  if (edges.left) {
    const snap = closestSnap([committed.x], xCandidates, thresholdX);
    if (snap) {
      const right = committed.x + committed.width;
      x = clamp(round(snap.candidate), 0, right - MIN_SIZE_PERCENT);
      width = round(right - x);
      guideX = snap.candidate;
    }
  } else if (edges.right) {
    const right = committed.x + committed.width;
    const snap = closestSnap([right], xCandidates, thresholdX);
    if (snap) {
      const newRight = clamp(round(snap.candidate), committed.x + MIN_SIZE_PERCENT, 100);
      width = round(newRight - committed.x);
      guideX = snap.candidate;
    }
  }

  let y = committed.y;
  let height = committed.height;
  let guideY: number | null = null;
  if (edges.top) {
    const snap = closestSnap([committed.y], yCandidates, thresholdY);
    if (snap) {
      const bottom = committed.y + committed.height;
      y = clamp(round(snap.candidate), 0, bottom - MIN_SIZE_PERCENT);
      height = round(bottom - y);
      guideY = snap.candidate;
    }
  } else if (edges.bottom) {
    const bottom = committed.y + committed.height;
    const snap = closestSnap([bottom], yCandidates, thresholdY);
    if (snap) {
      const newBottom = clamp(round(snap.candidate), committed.y + MIN_SIZE_PERCENT, 100);
      height = round(newBottom - committed.y);
      guideY = snap.candidate;
    }
  }

  return { position: { ...committed, x, y, width, height }, guideX, guideY };
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

/** How far a corner-locked resize's single scale factor is allowed to range, given which corner
 * is being dragged and where the opposite (fixed) corner sits - shared by resizeCornerLocked and
 * snapCornerResize so a snapped scale is clamped exactly the same way an unsnapped one is. */
function cornerScaleBounds(
  start: BlockPosition,
  signX: 1 | -1,
  signY: 1 | -1,
): { minScale: number; maxScale: number; fixedX: number; fixedY: number } {
  const fixedX = signX === 1 ? start.x : start.x + start.width;
  const fixedY = signY === 1 ? start.y : start.y + start.height;
  const maxWidthPercent = signX === 1 ? 100 - fixedX : fixedX;
  const maxHeightPercent = signY === 1 ? 100 - fixedY : fixedY;

  const minScale = Math.max(MIN_SIZE_PERCENT / start.width, MIN_SIZE_PERCENT / start.height);
  const maxScale = Math.min(maxWidthPercent / start.width, maxHeightPercent / start.height);
  return { minScale, maxScale, fixedX, fixedY };
}

function applyCornerScale(
  start: BlockPosition,
  signX: 1 | -1,
  signY: 1 | -1,
  scale: number,
  stagePx: { width: number; height: number },
): BlockPosition {
  const width = start.width * scale;
  const height = start.height * scale;
  const { x, y } = anchorResize(start, -signX * 0.5, -signY * 0.5, width, height, stagePx);
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

  const { minScale, maxScale } = cornerScaleBounds(start, signX, signY);
  const scale = clamp(rawScale, minScale, maxScale);

  return applyCornerScale(start, signX, signY, scale, stagePx);
}

/**
 * Smart guides for a corner-locked resize (image/video) - unlike snapResize, the two dragged
 * edges can't move independently (the aspect ratio has to stay fixed), so only ONE axis's snap
 * can actually apply. Whichever of the dragged corner's x/y is closer to a candidate (compared in
 * real pixels, since a percent of stage width and a percent of stage height aren't the same
 * distance unless the stage is square) wins, and the single scale factor it implies is applied
 * through the exact same path (and clamping) as an unsnapped drag - so the other axis just rides
 * along at the same ratio, the way a locked-aspect resize always works. Not attempted for a
 * rotated block, same reasoning as snapMove/snapResize.
 */
export function snapCornerResize(
  committed: BlockPosition,
  start: BlockPosition,
  handle: CornerHandleId,
  siblings: BlockPosition[],
  stagePx: { width: number; height: number },
): SnapResult {
  const signX = handle === "ne" || handle === "se" ? 1 : -1;
  const signY = handle === "sw" || handle === "se" ? 1 : -1;
  const { minScale, maxScale, fixedX, fixedY } = cornerScaleBounds(start, signX, signY);

  const thresholdX = (SNAP_PX / stagePx.width) * 100;
  const thresholdY = (SNAP_PX / stagePx.height) * 100;
  const { x: xCandidates, y: yCandidates } = snapCandidates(siblings);

  const cornerX = signX === 1 ? committed.x + committed.width : committed.x;
  const cornerY = signY === 1 ? committed.y + committed.height : committed.y;
  const snapX = closestSnap([cornerX], xCandidates, thresholdX);
  const snapY = closestSnap([cornerY], yCandidates, thresholdY);
  if (!snapX && !snapY) return { position: committed, guideX: null, guideY: null };

  const xDeltaPx = snapX ? Math.abs(snapX.delta) * (stagePx.width / 100) : Infinity;
  const yDeltaPx = snapY ? Math.abs(snapY.delta) * (stagePx.height / 100) : Infinity;

  let scale: number;
  let guideX: number | null = null;
  let guideY: number | null = null;
  if (xDeltaPx <= yDeltaPx) {
    const newWidth = signX === 1 ? snapX!.candidate - fixedX : fixedX - snapX!.candidate;
    scale = newWidth / start.width;
    guideX = snapX!.candidate;
  } else {
    const newHeight = signY === 1 ? snapY!.candidate - fixedY : fixedY - snapY!.candidate;
    scale = newHeight / start.height;
    guideY = snapY!.candidate;
  }

  return { position: applyCornerScale(start, signX, signY, clamp(scale, minScale, maxScale), stagePx), guideX, guideY };
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

/**
 * Distance in px from a screen point to the nearest edge of a block's own true (unrotated) box,
 * measured in that box's own local frame - negative once the point falls outside it. Unlike a
 * plain getBoundingClientRect()-based check, this stays correct at any rotation:
 * getBoundingClientRect() on a rotated element returns the *axis-aligned* box around the rotated
 * shape - strictly larger than the shape itself except at 0/90/180/270° - so comparing a screen
 * point against THAT box's edges increasingly stops corresponding to the block's own true,
 * rotated outline as rotation grows; by 10-20° it barely touches the shape's own corners at all,
 * which is exactly why the "near an edge" drag zone this feeds (see BlockView.tsx's own
 * edgeThreshold) used to vanish almost as soon as any rotation was applied. This instead measures
 * in the block's own local space: the pointer's position relative to the block's center, rotated
 * backward by the block's own rotation (see unrotateDelta - exactly the same trick
 * resizeFromHandle's own pointer math already relies on) - compared against the block's own true,
 * never-rotated pixel width/height, derived from its position percentages and the stage's own
 * size rather than from any post-transform DOM rect.
 */
export function edgeDistancePx(clientX: number, clientY: number, position: BlockPosition, stage: DOMRect): number {
  const widthPx = (position.width / 100) * stage.width;
  const heightPx = (position.height / 100) * stage.height;
  const centerX = stage.left + ((position.x + position.width / 2) / 100) * stage.width;
  const centerY = stage.top + ((position.y + position.height / 2) / 100) * stage.height;
  const { dx: localX, dy: localY } = unrotateDelta(clientX - centerX, clientY - centerY, position.rotation ?? 0);
  return Math.min(widthPx / 2 - Math.abs(localX), heightPx / 2 - Math.abs(localY));
}
