import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = { label: string; onClick: () => void; danger?: boolean; hint?: string } | { separator: true };

/** What opening a menu needs of an event: a right click (the mouse event) or, from the keyboard, a place made from the element (see
 * contextMenuEventAt). */
export type ContextMenuEvent = Pick<ReactMouseEvent, "clientX" | "clientY" | "preventDefault" | "stopPropagation">;

/** The "event" of a menu that is opened with the keyboard (the Menu key, Shift+F10) for `element`: at its lower left. */
export function contextMenuEventAt(element: Element): ContextMenuEvent {
  const rect = element.getBoundingClientRect();
  return { clientX: rect.left + 16, clientY: rect.bottom - 8, preventDefault: () => {}, stopPropagation: () => {} };
}

/** Whether a key press asks for the context menu of the focused element. */
export function isContextMenuKey(e: { key: string; shiftKey: boolean }): boolean {
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** What had the focus when the menu opened - it gets it back when the menu closes. */
  opener: HTMLElement | null;
}

/** One shared context-menu instance per surface (e.g. the sidebar) - rows call `open` with their own items. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  function open(event: ContextMenuEvent, items: ContextMenuItem[]) {
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(event.clientX, window.innerWidth - 220);
    const y = Math.min(event.clientY, window.innerHeight - items.length * 30 - 16);
    setMenu({ x, y, items, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null });
  }

  function close() {
    setMenu(null);
  }

  return { menu, open, close };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const closeNow = () => onClose();
    const entries = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const items = entries();
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      let next = -1;
      if (e.key === "ArrowDown") next = (index + 1) % items.length;
      else if (e.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else if (e.key === "Tab") {
        onClose();
        return;
      }
      if (next !== -1) {
        e.preventDefault();
        e.stopPropagation();
        items[next].focus();
      }
    };
    window.addEventListener("click", closeNow);
    window.addEventListener("blur", closeNow);
    // (Capture: the arrow keys must not also move the selection or the element behind the menu.)
    window.addEventListener("keydown", onKey, true);
    // The first entry has the focus - for a menu that was opened with the keyboard it has to; with the mouse it does no harm.
    const frame = requestAnimationFrame(() => entries()[0]?.focus({ preventScroll: true }));
    const opener = menu.opener;
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("click", closeNow);
      window.removeEventListener("blur", closeNow);
      window.removeEventListener("keydown", onKey, true);
      // Back to what had it - unless that is gone (the action moved or removed it) or something else has the focus by now.
      if (opener && opener.isConnected && (document.activeElement === document.body || ref.current?.contains(document.activeElement))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div ref={ref} className="weft-context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      {menu.items.map((item, index) =>
        "separator" in item ? (
          <div key={index} className="weft-context-menu-separator" role="separator" />
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            className={"weft-context-menu-item" + (item.danger ? " is-danger" : "")}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.hint && <span className="weft-context-menu-hint">{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
