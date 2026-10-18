import { useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/**
 * What the dark backdrop of a dialog needs to close it on "a click beside the dialog" - and only that: the press has to start on the
 * backdrop as well. Selecting text in the dialog and letting go outside it makes the browser fire a click on the backdrop (the
 * closest element both ends of the drag are in), which is no click beside the dialog and must not close it.
 */
export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: ReactMouseEvent<HTMLElement>) => {
      const close = pressedOnBackdrop.current && e.target === e.currentTarget;
      pressedOnBackdrop.current = false;
      if (close) onClose();
    },
  };
}
