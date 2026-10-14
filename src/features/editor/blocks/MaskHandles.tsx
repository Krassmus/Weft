import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect } from "react";
import { fitPoints, insertPointAfter, movePoints, pointsBox, removePoint, toggleSmooth } from "../../../core/document/imageMask";
import { imageMaskPathD, imageMaskSegmentMiddles } from "../../../core/runtime/imageGeometry.js";
import type { ImageBlock, ImageMask, ImageMaskPoint } from "../../../core/types";
import { useImageEdit } from "./imageEditStore";
import { useImageBoxAspect } from "./ImageSvg";
import { unrotateDelta } from "./resizeMath";

interface MaskHandlesProps {
  /** The image as it is shown (with the points of a drag in progress). */
  block: ImageBlock & { mask: ImageMask };
  /** The slide's box on the screen. */
  stageRect: () => DOMRect | null;
  /** The mask while one of its points (or the whole of it) is being dragged (null: the drag is over). */
  onLive: (mask: ImageMask | null) => void;
  onCommit: (mask: ImageMask) => void;
}

const DRAG_THRESHOLD_PX = 3;
const MIN_SIZE_PERCENT = 3;

type Corner = "tl" | "tr" | "br" | "bl";
const CORNERS: Corner[] = ["tl", "tr", "br", "bl"];

/**
 * What an image offers on the canvas while its mask is being edited ("Maske" in the sidebar): a handle on every point of the
 * curve (drag to move it, double-click to make it a corner/smooth), a small "+" on the curve between two points (drag it to make a
 * new point there), the dashed outline (drag it to move the whole shape) and a square on each corner of the box around the shape
 * (drag to scale it; with Shift the proportions stay). All in percent of the block's box.
 */
export function MaskHandles({ block, stageRect, onLive, onCommit }: MaskHandlesProps) {
  const boxAspect = useImageBoxAspect(block);
  const selected = useImageEdit((s) => s.selectedPoint);
  const select = useImageEdit((s) => s.select);
  const points = block.mask.points;
  const middles = imageMaskSegmentMiddles(points, boxAspect);
  const box = pointsBox(points);
  const height = 100 / boxAspect;

  // Delete takes the selected point away instead of the whole block.
  useEffect(() => {
    if (selected === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (selected !== null && points.length > 3) {
        onCommit({ ...block.mask, points: removePoint(points, selected) });
        select(null);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selected, points, block.mask, onCommit, select]);

  /** A drag: `next` works out the new points from the pointer's position (percent of the box) and the one where it began. */
  function beginDrag(
    e: ReactPointerEvent,
    next: (pointer: { x: number; y: number }, began: { x: number; y: number }, shift: boolean) => ImageMaskPoint[],
    options: { force?: boolean; start?: ImageMaskPoint[] } = {},
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const stage = stageRect();
    if (!stage) return;
    const position = block.position;
    const widthPx = (position.width / 100) * stage.width;
    const heightPx = (position.height / 100) * stage.height;
    const centerX = stage.left + ((position.x + position.width / 2) / 100) * stage.width;
    const centerY = stage.top + ((position.y + position.height / 2) / 100) * stage.height;
    const toPercent = (clientX: number, clientY: number) => {
      // The pointer in the block's own frame (the block may be rotated), as percent of its box.
      const { dx, dy } = unrotateDelta(clientX - centerX, clientY - centerY, position.rotation ?? 0);
      return { x: 50 + (dx / widthPx) * 100, y: 50 + (dy / heightPx) * 100 };
    };
    const began = toPercent(e.clientX, e.clientY);
    const startX = e.clientX;
    const startY = e.clientY;
    let result = options.start ?? points;
    let moved = !!options.force;
    if (options.force) onLive({ ...block.mask, points: result });

    function handleMove(ev: PointerEvent) {
      ev.preventDefault();
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      moved = true;
      result = next(toPercent(ev.clientX, ev.clientY), began, ev.shiftKey);
      onLive({ ...block.mask, points: result });
    }
    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      onLive(null);
      if (moved) onCommit({ ...block.mask, points: result });
    }
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function dragPoint(index: number, start: ImageMaskPoint[], insert: boolean, e: ReactPointerEvent) {
    select(index);
    beginDrag(
      e,
      (pointer) =>
        start.map((p, i) =>
          i === index ? { ...p, x: Math.round(Math.min(100, Math.max(0, pointer.x)) * 100) / 100, y: Math.round(Math.min(100, Math.max(0, pointer.y)) * 100) / 100 } : p,
        ),
      { force: insert, start },
    );
  }

  function dragCorner(corner: Corner, e: ReactPointerEvent) {
    const from = box;
    // The corner that stays where it is: the opposite one.
    const anchorX = corner === "tl" || corner === "bl" ? from.x + from.width : from.x;
    const anchorY = corner === "tl" || corner === "tr" ? from.y + from.height : from.y;
    beginDrag(e, (pointer, _began, shift) => {
      let px = Math.min(100, Math.max(0, pointer.x));
      let py = Math.min(100, Math.max(0, pointer.y));
      if (shift && from.width > 0 && from.height > 0) {
        // The proportions stay: the pointer's larger relative change decides.
        const scale = Math.max(Math.abs(px - anchorX) / from.width, Math.abs(py - anchorY) / from.height);
        px = anchorX + Math.sign(px - anchorX || 1) * from.width * scale;
        py = anchorY + Math.sign(py - anchorY || 1) * from.height * scale;
        px = Math.min(100, Math.max(0, px));
        py = Math.min(100, Math.max(0, py));
      }
      const width = Math.max(MIN_SIZE_PERCENT, Math.abs(px - anchorX));
      const heightNew = Math.max(MIN_SIZE_PERCENT, Math.abs(py - anchorY));
      const x = px < anchorX ? anchorX - width : anchorX;
      const y = py < anchorY ? anchorY - heightNew : anchorY;
      return fitPoints(points, from, { x, y, width, height: heightNew });
    });
  }

  function dragBody(e: ReactPointerEvent) {
    beginDrag(e, (pointer, began) => movePoints(points, pointer.x - began.x, pointer.y - began.y));
  }

  const corners: Record<Corner, { x: number; y: number }> = {
    tl: { x: box.x, y: box.y },
    tr: { x: box.x + box.width, y: box.y },
    br: { x: box.x + box.width, y: box.y + box.height },
    bl: { x: box.x, y: box.y + box.height },
  };

  return (
    <div className="weft-mask-handles">
      <svg className="weft-mask-outline" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        <path d={imageMaskPathD(points, boxAspect)} className="weft-mask-outline-body" onPointerDown={dragBody} />
      </svg>
      {CORNERS.map((corner) => (
        <div
          key={corner}
          className={`weft-mask-scale weft-mask-scale-${corner}`}
          style={{ left: `${corners[corner].x}%`, top: `${corners[corner].y}%` }}
          title="Ziehen: Größe der Form ändern (Umschalt: Proportionen behalten)"
          onPointerDown={(e) => dragCorner(corner, e)}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
      {middles.map((middle, i) => (
        <div
          key={`add-${i}`}
          className="weft-arrow-add weft-mask-add"
          style={{ left: `${middle.x}%`, top: `${middle.y}%` }}
          title="Ziehen: neuer Punkt"
          onPointerDown={(e) => {
            const inserted = insertPointAfter(points, i, boxAspect);
            dragPoint(i + 1, inserted, true, e);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
      {points.map((point, i) => (
        <div
          key={`point-${i}`}
          className={
            "weft-arrow-point weft-mask-point" + (point.smooth ? " is-smooth" : "") + (selected === i ? " is-selected" : "")
          }
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          title="Ziehen: verschieben - Doppelklick: Ecke oder weicher Übergang"
          onPointerDown={(e) => dragPoint(i, points, false, e)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onCommit({ ...block.mask, points: toggleSmooth(points, i) });
          }}
        />
      ))}
    </div>
  );
}
