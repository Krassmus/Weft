import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** "page" rows can be dropped into any container (the top-level sequence or any branch) - "logic"
 * rows (a logic block itself, never held by a branch - see Branch's own comment in types.ts) and
 * "block" rows (an element in a page's/layout's own Elemente list, see PagePanel.tsx/
 * LayoutPanel.tsx) stay restricted to reordering within their own container: "top" is the only one
 * a logic block ever has, and a block's container (its own page or layout id) is never a valid
 * drop target for a block from a *different* page/layout anyway. */
type DragKind = "page" | "logic" | "block";

interface DragOverState {
  sourceContainerId: string;
  sourceIndex: number;
  targetContainerId: string;
  overIndex: number;
  position: "before" | "after";
}

type MoveFn = (targetContainerId: string, targetIndex: number) => void;

/**
 * Pointer-events based drag reordering (not native HTML5 DnD, which is inconsistent in
 * WebKit/Tauri and doesn't unify with touch): each draggable row carries data-drag-container /
 * data-drag-index attributes, and elementFromPoint() during pointermove finds the row under the
 * cursor without every row needing its own DOM ref. `containerId` scopes which list a row belongs
 * to (the top-level sequence, or a single branch's pages) - a "page" drag can land in ANY
 * container (moving the page there), a "logic" drag only within its own ("top" is the only one a
 * logic block ever has).
 */
export function useDragReorder() {
  const [over, setOver] = useState<DragOverState | null>(null);
  const overRef = useRef<DragOverState | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const startedRef = useRef(false);
  const kindRef = useRef<DragKind | null>(null);
  const containerRef = useRef<string | null>(null);
  const sourceIndexRef = useRef<number | null>(null);
  const onMoveRef = useRef<MoveFn | null>(null);

  function handleMove(e: PointerEvent) {
    if (!startRef.current || !kindRef.current || containerRef.current === null || sourceIndexRef.current === null) return;
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
    if (!row) return;
    const rowContainer = row.dataset.dragContainer!;
    // A "logic"/"block" drag may only reorder within the container it started in ("top" for a
    // logic block; a page's or layout's own id for a block - see DragKind's own doc comment); a
    // "page" drag may land in any container, including a different one than it started in.
    if (kindRef.current !== "page" && rowContainer !== containerRef.current) return;

    const index = Number(row.dataset.dragIndex);
    const rect = row.getBoundingClientRect();
    const position: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const next: DragOverState = {
      sourceContainerId: containerRef.current,
      sourceIndex: sourceIndexRef.current,
      targetContainerId: rowContainer,
      overIndex: index,
      position,
    };
    overRef.current = next;
    setOver(next);
  }

  function finish() {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    document.body.classList.remove("weft-dragging");

    if (startedRef.current && overRef.current && onMoveRef.current) {
      const { sourceContainerId, sourceIndex, targetContainerId, overIndex, position } = overRef.current;
      const sameContainer = targetContainerId === sourceContainerId;
      // Removing the source item from THIS SAME container first shifts every later index in it
      // down by one - irrelevant when the drop target is a different container, since removing
      // from one list never affects indices in another.
      const adjusted = sameContainer && overIndex > sourceIndex ? overIndex - 1 : overIndex;
      const to = position === "after" ? adjusted + 1 : adjusted;
      if (!(sameContainer && to === sourceIndex)) onMoveRef.current(targetContainerId, to);
    }

    startRef.current = null;
    startedRef.current = false;
    kindRef.current = null;
    containerRef.current = null;
    sourceIndexRef.current = null;
    onMoveRef.current = null;
    overRef.current = null;
    setOver(null);
  }

  function bind(kind: DragKind, containerId: string, index: number, onMove: MoveFn) {
    return {
      "data-drag-container": containerId,
      "data-drag-index": index,
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        startRef.current = { x: e.clientX, y: e.clientY };
        startedRef.current = false;
        kindRef.current = kind;
        containerRef.current = containerId;
        sourceIndexRef.current = index;
        onMoveRef.current = onMove;
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
      },
      dragClassName:
        over?.sourceContainerId === containerId && over.sourceIndex === index
          ? " is-dragging"
          : over?.targetContainerId === containerId &&
              over.overIndex === index &&
              !(over.sourceContainerId === containerId && over.sourceIndex === index)
            ? over.position === "before"
              ? " is-drop-before"
              : " is-drop-after"
            : "",
    };
  }

  return { bind };
}
