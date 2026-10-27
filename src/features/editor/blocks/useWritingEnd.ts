import { useEffect, useRef } from "react";

const FIELDS = ".weft-sort-edit, .weft-checker-edit, .weft-matching-edit";

/**
 * Ends the writing in place (a field in the canvas, see SortCanvas, CheckerCanvas, MatchingCanvas) as soon as the person goes elsewhere: a press
 * anywhere but on the field, the block being deselected, or the block going away. The canvas takes the focus off the field with every press on it
 * (preventDefault to keep the browser from selecting), so the field's own blur doesn't come - this does. `end` keeps what was written, and does
 * nothing when the writing is over already.
 */
export function useWritingEnd(active: boolean, selected: boolean, end: () => void) {
  const endRef = useRef(end);
  endRef.current = end;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (!active) return;
    const down = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(FIELDS)) return;
      endRef.current();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [active]);
  useEffect(() => {
    if (active && !selected) endRef.current();
  }, [active, selected]);
  useEffect(
    () => () => {
      if (activeRef.current) endRef.current();
    },
    [],
  );
}
