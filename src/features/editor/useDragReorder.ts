import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface DragOverState {
  containerId: string;
  sourceIndex: number;
  overIndex: number;
  position: "before" | "after";
}

type ReorderFn = (from: number, to: number) => void;

/**
 * Pointer-events based drag reordering (not native HTML5 DnD, which is inconsistent in
 * WebKit/Tauri and doesn't unify with touch): each draggable row carries data-drag-container /
 * data-drag-index attributes, and elementFromPoint() during pointermove finds the row under the
 * cursor without every row needing its own DOM ref. `containerId` scopes a drag to one list
 * (the top-level sequence, or a single branch's pages) - dragging never crosses container ids.
 */
export function useDragReorder() {
  const [over, setOver] = useState<DragOverState | null>(null);
  const overRef = useRef<DragOverState | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const startedRef = useRef(false);
  const containerRef = useRef<string | null>(null);
  const sourceIndexRef = useRef<number | null>(null);
  const commitRef = useRef<ReorderFn | null>(null);

  function handleMove(e: PointerEvent) {
    if (!startRef.current || containerRef.current === null || sourceIndexRef.current === null) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (!startedRef.current) {
      if (Math.hypot(dx, dy) < 4) return;
      startedRef.current = true;
      document.body.classList.add("weft-dragging");
    }
    e.preventDefault();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el instanceof Element ? el.closest<HTMLElement>("[data-drag-container]") : null;
    if (!row || row.dataset.dragContainer !== containerRef.current) return;

    const index = Number(row.dataset.dragIndex);
    const rect = row.getBoundingClientRect();
    const position: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const next: DragOverState = { containerId: containerRef.current, sourceIndex: sourceIndexRef.current, overIndex: index, position };
    overRef.current = next;
    setOver(next);
  }

  function finish() {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    document.body.classList.remove("weft-dragging");

    if (startedRef.current && overRef.current && commitRef.current) {
      const { sourceIndex, overIndex, position } = overRef.current;
      const adjusted = overIndex > sourceIndex ? overIndex - 1 : overIndex;
      const to = position === "after" ? adjusted + 1 : adjusted;
      if (to !== sourceIndex) commitRef.current(sourceIndex, to);
    }

    startRef.current = null;
    startedRef.current = false;
    containerRef.current = null;
    sourceIndexRef.current = null;
    commitRef.current = null;
    overRef.current = null;
    setOver(null);
  }

  function bind(containerId: string, index: number, onReorder: ReorderFn) {
    return {
      "data-drag-container": containerId,
      "data-drag-index": index,
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        startRef.current = { x: e.clientX, y: e.clientY };
        startedRef.current = false;
        containerRef.current = containerId;
        sourceIndexRef.current = index;
        commitRef.current = onReorder;
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
      },
      dragClassName:
        over?.containerId === containerId && over.sourceIndex === index
          ? " is-dragging"
          : over?.containerId === containerId && over.overIndex === index && over.sourceIndex !== index
            ? over.position === "before"
              ? " is-drop-before"
              : " is-drop-after"
            : "",
    };
  }

  return { bind };
}
