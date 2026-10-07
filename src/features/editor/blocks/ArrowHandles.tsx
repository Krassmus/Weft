import type { PointerEvent as ReactPointerEvent } from "react";
import { fitArrowBox } from "../../../core/document/arrow";
import { arrowSegmentMiddles } from "../../../core/runtime/arrowGeometry.js";
import type { ArrowBlock, ArrowPoint } from "../../../core/types";
import { useArrowBoxAspect } from "./ArrowSvg";
import { unrotateDelta } from "./resizeMath";

interface ArrowHandlesProps {
  /** The arrow as it is shown (with the waypoints of a drag in progress). */
  block: ArrowBlock;
  /** The slide's width : height. */
  slideAspect: number;
  /** The slide's box on the screen. */
  stageRect: () => DOMRect | null;
  /** The waypoints while one is being dragged (null: the drag is over). */
  onLive: (points: ArrowPoint[] | null) => void;
  /** The finished edit: the new waypoints and the box that fits them. */
  onCommit: (patch: Pick<ArrowBlock, "position" | "points">) => void;
}

const DRAG_THRESHOLD_PX = 3;

/**
 * What an arrow offers on the canvas while it is selected: a round handle on every waypoint (drag it to move
 * the waypoint, double-click it to remove it) and a small "+" on the curve between two waypoints (drag it to
 * make a new waypoint there; a click makes one right on the curve). The waypoints are percent of the block's
 * box - after an edit the box is fitted around them again (fitArrowBox).
 */
export function ArrowHandles({ block, slideAspect, stageRect, onLive, onCommit }: ArrowHandlesProps) {
  const boxAspect = useArrowBoxAspect(block);
  const middles = arrowSegmentMiddles(block, boxAspect);

  /** The waypoints of `start` with waypoint `index` (a new one, if `insert`) following the pointer. */
  function beginDrag(index: number, start: ArrowPoint[], insert: boolean, e: ReactPointerEvent) {
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
    const startX = e.clientX;
    const startY = e.clientY;
    let points = start;
    let moved = false;

    function handleMove(ev: PointerEvent) {
      ev.preventDefault();
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      moved = true;
      // The pointer in the block's own frame (the block may be rotated), as percent of its box.
      const { dx, dy } = unrotateDelta(ev.clientX - centerX, ev.clientY - centerY, position.rotation ?? 0);
      const point = { x: 50 + (dx / widthPx) * 100, y: 50 + (dy / heightPx) * 100 };
      points = start.map((p, i) => (i === index ? point : p));
      onLive(points);
    }
    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      onLive(null);
      if (moved || insert) onCommit(fitArrowBox(position, points, slideAspect));
    }
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <div className="weft-arrow-handles">
      {middles.map((middle, i) => (
        <div
          key={`add-${i}`}
          className="weft-arrow-add"
          style={{ left: `${middle.x}%`, top: `${middle.y}%` }}
          title="Ziehen: neuer Wegpunkt"
          onPointerDown={(e) => beginDrag(i + 1, [...block.points.slice(0, i + 1), middle, ...block.points.slice(i + 1)], true, e)}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
      {block.points.map((point, i) => (
        <div
          key={`point-${i}`}
          className="weft-arrow-point"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          title={block.points.length > 2 ? "Ziehen: verschieben - Doppelklick: entfernen" : "Ziehen: verschieben"}
          onPointerDown={(e) => beginDrag(i, block.points, false, e)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (block.points.length <= 2) return;
            onCommit(
              fitArrowBox(
                block.position,
                block.points.filter((_, j) => j !== i),
                slideAspect,
              ),
            );
          }}
        />
      ))}
    </div>
  );
}
