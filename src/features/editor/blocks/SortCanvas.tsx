import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Block, SortBlock, SortItem } from "../../../core/types";
import { useEditingLanguage } from "../useEditingLanguage";
import { SortView } from "./SortView";

/**
 * A sorting puzzle on the canvas: the objects can be put into the right order by dragging - once the block is selected (before that a press on it
 * moves the block, like with any other). It goes the way it does in the player (renderSortBlock): a copy of the object follows the pointer, the
 * object leaves its silhouette where it would be put, and the others glide to make room. The block is changed once, when the pointer is let go,
 * so that a move is one step of the history.
 */
export function SortCanvas({ block, selected, onUpdate }: { block: SortBlock; selected: boolean; onUpdate?: (patch: Partial<Block>) => void }) {
  const { lang, defaultLang } = useEditingLanguage();
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const places = useRef(new Map<string, { x: number; y: number }>());

  // The objects that moved glide to their new places (the FLIP way: put them back where they were, then let go). Their places are those of the
  // layout (offsetLeft / offsetTop), not where a gliding object happens to be at the moment.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.querySelectorAll<HTMLElement>(":scope .weft-sort-list > .weft-sort-item").forEach((el) => {
      const id = el.dataset.weftItem as string;
      const now = { x: el.offsetLeft, y: el.offsetTop };
      const was = places.current.get(id);
      places.current.set(id, now);
      if (!drag || reduced || !was) return;
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (!dx && !dy) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = "transform 0.18s ease";
      el.style.transform = "";
      window.setTimeout(() => {
        el.style.transition = "";
      }, 220);
    });
  });

  function start(event: ReactPointerEvent, item: SortItem) {
    if (!selected || event.button !== 0 || !onUpdate) return;
    event.stopPropagation();
    event.preventDefault();
    const held = event.currentTarget as HTMLElement;
    const list = held.closest(".weft-sort-list") as HTMLElement | null;
    const body = list?.parentElement;
    if (!list || !body) return;
    const vertical = block.orientation !== "horizontal";
    const startX = event.clientX;
    const startY = event.clientY;
    let order = block.items.map((it) => it.id);
    let started = false;
    let ghost: HTMLElement | null = null;
    let grab = { x: 0, y: 0 };
    let bodyRect: DOMRect | null = null;
    const move = (e: PointerEvent) => {
      if (!started) {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 6) return;
        started = true;
        bodyRect = body.getBoundingClientRect();
        const rect = held.getBoundingClientRect();
        grab = { x: startX - rect.left, y: startY - rect.top };
        ghost = held.cloneNode(true) as HTMLElement;
        ghost.classList.add("is-ghost");
        ghost.classList.remove("is-movable");
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        body.appendChild(ghost);
      }
      if (ghost && bodyRect) {
        ghost.style.left = `${e.clientX - bodyRect.left - grab.x}px`;
        ghost.style.top = `${e.clientY - bodyRect.top - grab.y}px`;
      }
      // It goes after every other object whose middle the pointer has passed (measured from the layout, not from where a gliding object is).
      const listRect = list.getBoundingClientRect();
      const pointer = vertical ? e.clientY - listRect.top : e.clientX - listRect.left;
      const others = [...list.querySelectorAll<HTMLElement>(":scope > .weft-sort-item")].filter((el) => el.dataset.weftItem !== item.id);
      let index = 0;
      others.forEach((el, i) => {
        if (pointer > (vertical ? el.offsetTop + el.offsetHeight / 2 : el.offsetLeft + el.offsetWidth / 2)) index = i + 1;
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
      ghost?.remove();
      setDrag(null);
      if (!started || order.join() === block.items.map((it) => it.id).join()) return;
      onUpdate({ items: order.map((id) => block.items.find((it) => it.id === id) as SortItem) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return <SortView block={block} lang={lang} defaultLang={defaultLang} order={drag?.order ?? null} grabbed={drag?.id ?? null} onItemPointerDown={selected ? start : undefined} rootRef={rootRef} />;
}
