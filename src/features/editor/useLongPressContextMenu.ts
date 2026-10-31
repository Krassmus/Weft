import { useEffect } from "react";

/** How long a finger has to rest on an element for its menu (the same as a long press picks up a row of a list, see useDragReorder). */
export const CONTEXT_MENU_LONG_PRESS_MS = 500;
/** How far a finger may wander in that time (in pixels): further is a drag or a scroll, not a press. */
const SLOP_PX = 10;
/** For this long after a menu was opened by a long press, the click that the finger lifting ends in is swallowed: it would otherwise land on the menu that has
 * just appeared under the finger (an entry of it - "Löschen" - or, anywhere else, the click that closes a menu). */
const SWALLOW_CLICK_MS = 800;

/**
 * Whether a press on `target` may open a context menu: not where the long press means something else - the text of a text being edited (the finger selects text
 * there, the system's own loupe and menu) and a field - nor on the rows of the lists that a long press picks up for moving (data-drag-container).
 */
export function opensMenuOnLongPress(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [data-drag-container], .weft-context-menu')) return false;
  return true;
}

/**
 * A long press with a finger (or a pen) opens the context menu of what is under it, the way a right click does with a mouse. A tablet has no right click, and the
 * browser of an iPad sends no `contextmenu` event for a long press: the menus (`onContextMenu` of the elements of the slide, of the answers of a quiz, ...) never
 * opened there. This sends the event itself, at the place of the finger, so that every element that has a menu has it on a tablet too.
 *
 * Where the browser does send one (Android), that one wins: the press is let go of as soon as it arrives.
 */
export function useLongPressContextMenu(): void {
  useEffect(() => {
    let timer: number | null = null;
    let pointerId: number | null = null;
    let origin = { x: 0, y: 0 };

    function cancel() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      pointerId = null;
    }

    function swallowNextClick() {
      const swallow = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
      };
      // (Until the finger has lifted and the click is there - or, if the browser sends none after a long press, until it is too late to be that one: a new touch,
      // or a moment later.)
      const end = () => {
        window.removeEventListener("click", swallow, { capture: true });
        window.removeEventListener("pointerdown", end, { capture: true });
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.addEventListener("pointerdown", end, { capture: true, once: true });
      window.setTimeout(end, SWALLOW_CLICK_MS);
    }

    function onPointerDown(event: PointerEvent) {
      cancel();
      if (event.pointerType === "mouse" || !event.isPrimary || !opensMenuOnLongPress(event.target)) return;
      pointerId = event.pointerId;
      origin = { x: event.clientX, y: event.clientY };
      const target = event.target as Element;
      timer = window.setTimeout(() => {
        timer = null;
        pointerId = null;
        // (What was pressed may have moved or gone in the meantime - then what is under the finger now.)
        const at = target.isConnected ? target : document.elementFromPoint(origin.x, origin.y);
        if (!at) return;
        const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, view: window, clientX: origin.x, clientY: origin.y, button: 2 });
        if (at.dispatchEvent(menu) === false) swallowNextClick();
      }, CONTEXT_MENU_LONG_PRESS_MS);
    }

    function onPointerMove(event: PointerEvent) {
      if (timer === null || event.pointerId !== pointerId) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > SLOP_PX) cancel();
    }

    function onPointerEnd(event: PointerEvent) {
      if (event.pointerId === pointerId) cancel();
    }

    // A menu of the browser itself (a real contextmenu event, not the one made above): it is the browser's turn.
    function onNativeContextMenu(event: MouseEvent) {
      if (event.isTrusted) cancel();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    window.addEventListener("contextmenu", onNativeContextMenu, true);
    return () => {
      cancel();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("contextmenu", onNativeContextMenu, true);
    };
  }, []);
}
