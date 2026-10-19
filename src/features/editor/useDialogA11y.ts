import { useEffect } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let counter = 0;

function focusablesIn(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.getClientRects().length > 0);
}

/**
 * What every dialog needs for a screen reader and for the keyboard: the role "dialog" with its heading as the name (and aria-modal for
 * one that blocks the rest), the focus moved into it when it opens - on its first control, or on a control that has already taken it -
 * kept inside while it is open (Tab and Shift+Tab go around), and given back to what had it before when the dialog closes.
 * `modal: false` is for a dialog that floats beside the work (the colour scheme): it gets the role and the focus but does not hold it.
 * `moveFocus: false` for one that works on a text that is being edited (the text format) - its selection must stay where it is.
 */
export function useDialogA11y(ref: RefObject<HTMLElement | null>, options: { modal?: boolean; moveFocus?: boolean } = {}): void {
  const { modal = true, moveFocus = true } = options;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.setAttribute("role", "dialog");
    if (modal) el.setAttribute("aria-modal", "true");
    const heading = el.querySelector<HTMLElement>("h1, h2, h3, [data-dialog-title]");
    if (heading) {
      if (!heading.id) heading.id = `weft-dialog-title-${++counter}`;
      el.setAttribute("aria-labelledby", heading.id);
    }
    if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
    // (A frame later: a floating dialog is hidden until it has been measured, and a hidden element takes no focus.)
    const frame = moveFocus
      ? requestAnimationFrame(() => {
          if (!el || el.contains(document.activeElement)) return;
          const first = focusablesIn(el).find((item) => !item.closest(".weft-modal-header")) ?? focusablesIn(el)[0];
          (first ?? el).focus({ preventScroll: true });
        })
      : 0;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !modal || !moveFocus || !el) return;
      const items = focusablesIn(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    el.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("keydown", onKeyDown);
      // Given back - unless something else has taken the focus by now.
      if (moveFocus && previous && previous.isConnected && (document.activeElement === document.body || !document.activeElement || el.contains(document.activeElement))) {
        previous.focus({ preventScroll: true });
      }
    };
    // (Once: a dialog is for as long as it is there.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
