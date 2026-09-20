import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = { label: string; onClick: () => void; danger?: boolean } | { separator: true };

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** One shared context-menu instance per surface (e.g. the sidebar) - rows call `open` with their own items. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  function open(event: ReactMouseEvent, items: ContextMenuItem[]) {
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(event.clientX, window.innerWidth - 220);
    const y = Math.min(event.clientY, window.innerHeight - items.length * 30 - 16);
    setMenu({ x, y, items });
  }

  function close() {
    setMenu(null);
  }

  return { menu, open, close };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return;
    const closeNow = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("click", closeNow);
    window.addEventListener("blur", closeNow);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", closeNow);
      window.removeEventListener("blur", closeNow);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div className="weft-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      {menu.items.map((item, index) =>
        "separator" in item ? (
          <div key={index} className="weft-context-menu-separator" />
        ) : (
          <button
            key={index}
            type="button"
            className={"weft-context-menu-item" + (item.danger ? " is-danger" : "")}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
