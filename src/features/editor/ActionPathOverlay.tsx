import { useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { updateActionEffect } from "../../core/document/actions";
import { aspectRatioNumeric } from "../../core/aspectRatio";
import { arrowCurveMiddles, arrowEvenPoints } from "../../core/runtime/arrowGeometry.js";
import { tr } from "../../core/i18n/tr";
import type { ArrowPoint, Page } from "../../core/types";
import { useDocumentStore } from "../../core/document/store";
import { useActionEdit } from "./actionEdit";

const DRAG_THRESHOLD_PX = 3;
const round = (value: number) => Math.round(value * 100) / 100;

/** The Aktionseffekt whose way is to be shown: the one of the event selected in the graph, else the one the panel last worked on - of
 * the block that is selected. */
function useEditedEffect(page: Page): { blockId: string; effectId: string } | null {
  const selection = useDocumentStore((s) => s.selection);
  const edited = useActionEdit();
  if (selection?.type === "event" && selection.pageId === page.id) {
    const match = /^block-action:([^:]+):([^:]+)$/.exec(selection.nodeId);
    return match ? { blockId: match[1], effectId: match[2] } : null;
  }
  if (selection?.type === "block" && selection.container.kind === "page" && selection.container.pageId === page.id && edited.blockId === selection.blockId && edited.effectId) {
    return { blockId: edited.blockId, effectId: edited.effectId };
  }
  return null;
}

/**
 * The way of a "move" Aktionseffekt, drawn on the slide for the block being edited like an arrow: a curve from where the block is when the
 * effect starts, through the stations the author has made (round white handles; a "+" on the curve makes a new one, a double click takes
 * one away), to the end - a red dot instead of an arrowhead, which is dragged to the place the block is to go to. The block's own box is
 * drawn there, dashed, in the size and turn it will have. The points are stored as offsets from the start, in percent of the slide.
 */
export function ActionPathOverlay({ page, stageRef, onDragEnd }: { page: Page; stageRef: RefObject<HTMLDivElement | null>; onDragEnd: () => void }) {
  const edited = useEditedEffect(page);
  const doc = useDocumentStore((s) => s.doc);
  // The way while a handle is being dragged (null: what is stored).
  const [live, setLive] = useState<ArrowPoint[] | null>(null);
  const block = edited ? page.blocks[edited.blockId] : undefined;
  const effects = block?.actionEffects ?? [];
  const index = edited ? effects.findIndex((e) => e.id === edited.effectId) : -1;
  const effect = index >= 0 ? effects[index] : undefined;
  if (!block || !effect || effect.type !== "move") return null;

  const aspect = aspectRatioNumeric(doc.content.aspectRatio);
  // Where the block is when the effect starts: its place on the slide, moved by the moves before this one.
  let startX = block.position.x + block.position.width / 2;
  let startY = block.position.y + block.position.height / 2;
  let startRotation = block.position.rotation ?? 0;
  for (let i = 0; i < index; i++) {
    const earlier = effects[i];
    if (earlier.type !== "move") continue;
    const end = earlier.path?.[earlier.path.length - 1];
    if (end) {
      startX += end.x;
      startY += end.y;
    }
    startRotation += earlier.rotation ?? 0;
  }
  const offsets = live ?? effect.path ?? [];
  const absolute = offsets.map((p) => ({ x: startX + p.x, y: startY + p.y }));
  const end = absolute[absolute.length - 1] ?? { x: startX, y: startY };

  // The curve in units of the slide's width (so that it is not stretched): y as percent of the width.
  const unit = (p: ArrowPoint) => ({ x: p.x, y: p.y / aspect });
  const control = [{ x: startX, y: startY }, ...absolute].map(unit);
  const curve = control.length > 1 ? arrowEvenPoints(control, 80) : control;
  const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`).join(" ");
  const middles = control.length > 1 ? arrowCurveMiddles(control).map((m) => ({ x: m.x, y: m.y * aspect })) : [];

  function beginDrag(handleIndex: number, start: ArrowPoint[], insert: boolean, e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || !block || !effect) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let points = start;
    let moved = false;
    function handleMove(ev: PointerEvent) {
      ev.preventDefault();
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD_PX) return;
      moved = true;
      const point = {
        x: round(((ev.clientX - stage!.left) / stage!.width) * 100 - startX),
        y: round(((ev.clientY - stage!.top) / stage!.height) * 100 - startY),
      };
      points = start.map((p, i) => (i === handleIndex ? point : p));
      setLive(points);
    }
    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      setLive(null);
      if (moved || insert) {
        updateActionEffect(page.id, block!.id, effect!.id, { path: points });
        onDragEnd();
      }
    }
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  // The block ends up turned by its own turn, the moves before and this one.
  const finalRotation = startRotation + (effect.rotation ?? 0);
  return (
    <div className="weft-action-path">
      <svg className="weft-action-path-line" viewBox={`0 0 100 ${100 / aspect}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={path} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Where the block ends up: its box, dashed, as large as it is and turned as it will be. */}
      <div
        className="weft-action-path-ghost"
        style={{
          left: `${end.x}%`,
          top: `${end.y}%`,
          width: `${block.position.width}%`,
          height: `${block.position.height}%`,
          transform: `translate(-50%, -50%) rotate(${round(finalRotation)}deg)`,
        }}
      />
      <div className="weft-action-path-start" style={{ left: `${startX}%`, top: `${startY}%` }} />
      {middles.map((middle, i) => (
        <div
          key={`add-${i}`}
          className="weft-arrow-add weft-action-path-add"
          style={{ left: `${middle.x}%`, top: `${middle.y}%` }}
          title={tr("ui.drag_new_waypoint")}
          onPointerDown={(e) => beginDrag(i, [...offsets.slice(0, i), { x: round(middle.x - startX), y: round(middle.y - startY) }, ...offsets.slice(i)], true, e)}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
      {absolute.map((point, i) => {
        const isEnd = i === absolute.length - 1;
        return (
          <div
            key={`point-${i}`}
            className={"weft-arrow-point " + (isEnd ? "weft-action-path-end" : "weft-action-path-station")}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            title={isEnd ? tr("ui.drag_move") : tr("ui.drag_move_double_click_remove")}
            onPointerDown={(e) => beginDrag(i, offsets, false, e)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (isEnd) return;
              updateActionEffect(page.id, block.id, effect.id, { path: offsets.filter((_, j) => j !== i) });
            }}
          />
        );
      })}
    </div>
  );
}
