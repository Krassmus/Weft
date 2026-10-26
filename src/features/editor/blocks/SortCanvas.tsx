import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Block, SortBlock, SortItem } from "../../../core/types";
import { useEditingLanguage } from "../useEditingLanguage";
import { SortView } from "./SortView";

/**
 * A sorting puzzle on the canvas: the objects can be put into the right order by dragging - once the block is selected (before that a press on it
 * moves the block, like with any other). The one that is held stands where it would be put and the others make room; the block is changed once,
 * when the pointer is let go, so that a move is one step of the history.
 */
export function SortCanvas({ block, selected, onUpdate }: { block: SortBlock; selected: boolean; onUpdate?: (patch: Partial<Block>) => void }) {
  const { lang, defaultLang } = useEditingLanguage();
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);

  function start(event: ReactPointerEvent, item: SortItem) {
    if (!selected || event.button !== 0 || !onUpdate) return;
    event.stopPropagation();
    event.preventDefault();
    const list = (event.currentTarget as HTMLElement).closest(".weft-sort-list") as HTMLElement | null;
    if (!list) return;
    const vertical = block.orientation !== "horizontal";
    const startX = event.clientX;
    const startY = event.clientY;
    let order = block.items.map((it) => it.id);
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 6) return;
      moved = true;
      // It goes after every other object whose middle the pointer has passed.
      const pointer = vertical ? e.clientY : e.clientX;
      const others = [...list.querySelectorAll<HTMLElement>(":scope > .weft-sort-item")].filter((el) => el.dataset.weftItem !== item.id);
      let index = 0;
      others.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (pointer > (vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2)) index = i + 1;
      });
      const ids = others.map((el) => el.dataset.weftItem as string);
      ids.splice(index, 0, item.id);
      if (ids.join() !== order.join()) order = ids;
      setDrag({ id: item.id, order });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      if (!moved || order.join() === block.items.map((it) => it.id).join()) return;
      onUpdate({ items: order.map((id) => block.items.find((it) => it.id === id) as SortItem) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return <SortView block={block} lang={lang} defaultLang={defaultLang} order={drag?.order ?? null} grabbed={drag?.id ?? null} onItemPointerDown={selected ? start : undefined} />;
}
