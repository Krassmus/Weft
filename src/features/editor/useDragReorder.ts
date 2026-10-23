import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** ("language" rows - the module's language list in the Einstellungen - and "color" rows - the colour scheme's table - behave like "block"
 * rows: reordering within their one list.)
 *
 * "page" rows can be dropped into any container (the top-level sequence or any branch) - "logic"
 * rows (a logic block itself, never held by a branch - see Branch's own comment in types.ts) and
 * "block" rows (an element in a page's/layout's own Elemente list, see PagePanel.tsx/
 * LayoutPanel.tsx) stay restricted to reordering within their own container: "top" is the only one
 * a logic block ever has, and a block's container (its own page or layout id) is never a valid
 * drop target for a block from a *different* page/layout anyway. */
type DragKind = "page" | "logic" | "block" | "language" | "color";

interface DragOverState {
  sourceContainerId: string;
  sourceIndex: number;
  targetContainerId: string;
  overIndex: number;
  position: "before" | "after";
}

type MoveFn = (targetContainerId: string, targetIndex: number) => void;

/** On a touchscreen (and with a pen, which scrolls like a finger) a row is only picked up after it was pressed for this long without
 * moving - like in Keynote on the iPad. Moving earlier is a scroll of the list, and the row stays where it is. */
const LONG_PRESS_MS = 450;
/** How far a finger may wander (in px) during that time and still count as pressing. */
const LONG_PRESS_SLOP = 10;

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
  // A touch (or pen) gesture: waits for the long press (timerRef), and is a drag only from then on (armedRef).
  const touchRef = useRef(false);
  const armedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Once a row is picked up the finger must not scroll the list any more. The browser has not begun to scroll yet (the finger has been
  // still), so cancelling the touch moves keeps it that way - which is why this listener is not passive.
  function blockScroll(e: TouchEvent) {
    if (armedRef.current && e.cancelable) e.preventDefault();
  }

  function handleMove(e: PointerEvent) {
    if (!startRef.current || !kindRef.current || containerRef.current === null || sourceIndexRef.current === null) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (touchRef.current && !armedRef.current) {
      // Moved before the long press was over: a scroll. Let go of the gesture; the browser scrolls the list.
      if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) finish();
      return;
    }
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
    window.removeEventListener("touchmove", blockScroll);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    touchRef.current = false;
    armedRef.current = false;
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
        if (e.pointerType !== "mouse") {
          touchRef.current = true;
          armedRef.current = false;
          window.addEventListener("touchmove", blockScroll, { passive: false });
          timerRef.current = window.setTimeout(() => {
            // Picked up: the row is lifted (the same look as while it is dragged), and from here on it follows the finger.
            timerRef.current = null;
            armedRef.current = true;
            startedRef.current = true;
            document.body.classList.add("weft-dragging");
            const lifted: DragOverState = { sourceContainerId: containerId, sourceIndex: index, targetContainerId: containerId, overIndex: index, position: "before" };
            overRef.current = lifted;
            setOver(lifted);
            navigator.vibrate?.(10);
          }, LONG_PRESS_MS);
        }
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
