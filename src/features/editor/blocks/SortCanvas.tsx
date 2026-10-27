import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Block, SortBlock, SortItem } from "../../../core/types";
import { useEditingLanguage } from "../useEditingLanguage";
import { useDocumentStore } from "../../../core/document/store";
import { addSortImage, setSortImage } from "../../../core/document/filesActions";
import { sortDropIndex, sortLayout } from "../../../core/document/sortLayout";
import { sortItemText, sortItemTextPatch } from "../../../core/document/translations";
import { createId } from "../../../core/id";
import { tr } from "../../../core/i18n/tr";
import { SortView } from "./SortView";
import { useWritingEnd } from "./useWritingEnd";

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
  // A double click on a picture asks for another file for it (the field is hidden, the click opens the chooser). A sorting puzzle lives on pages.
  const pageId = useDocumentStore((s) => Object.values(s.doc.content.pages).find((page) => block.id in page.blocks)?.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const pictureOf = useRef<string | null>(null);
  // The button "Add picture" opens the same chooser; what is chosen then becomes a new last object instead of the picture of one.
  const addingPicture = useRef(false);
  // The text of an object being written in place (a double click on it): kept until Enter or the field loses the focus; Escape drops it.
  const [writing, setWriting] = useState<{ id: string; value: string } | null>(null);
  const writingRef = useRef(writing);
  writingRef.current = writing;
  function commitWriting() {
    const current = writingRef.current;
    setWriting(null);
    writingRef.current = null;
    if (!current || !onUpdate) return;
    const item = block.items.find((it) => it.id === current.id);
    if (item && current.value !== sortItemText(block, item, lang, defaultLang)) onUpdate(sortItemTextPatch(block, current.id, lang, defaultLang, current.value));
  }
  useWritingEnd(writing !== null, selected, commitWriting);
  // The button "Add text": a new last object whose text is written in place at once.
  function addText() {
    if (!onUpdate) return;
    const text = tr("ui.sort_add_item");
    const id = createId();
    onUpdate({ items: [...block.items, { id, kind: "text", text }] });
    setWriting({ id, value: text });
  }
  function addImage() {
    addingPicture.current = true;
    pictureOf.current = null;
    fileInput.current?.click();
  }
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
    const { per } = sortLayout(block);
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
      // It goes after every other object whose middle the pointer has passed - on several lines: on the line whose middle is nearest (measured from
      // the layout, not from where a gliding object is).
      const listRect = list.getBoundingClientRect();
      const pointerX = e.clientX - listRect.left;
      const pointerY = e.clientY - listRect.top;
      const kids = [...list.querySelectorAll<HTMLElement>(":scope > .weft-sort-item")];
      const others = kids.filter((el) => el.dataset.weftItem !== item.id);
      const boxes = kids.map((el) => {
        const x = el.offsetLeft + el.offsetWidth / 2;
        const y = el.offsetTop + el.offsetHeight / 2;
        return vertical ? { along: y, cross: x } : { along: x, cross: y };
      });
      const index = sortDropIndex(per, boxes, kids.findIndex((el) => el.dataset.weftItem === item.id), vertical ? pointerY : pointerX, vertical ? pointerX : pointerY);
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

  return (
    <>
      <SortView
        block={block}
        lang={lang}
        defaultLang={defaultLang}
        order={drag?.order ?? null}
        grabbed={drag?.id ?? null}
        onItemPointerDown={selected ? start : undefined}
        onItemDoubleClick={
          selected && onUpdate
            ? (item) => {
                if (item.kind === "image") {
                  pictureOf.current = item.id;
                  fileInput.current?.click();
                } else setWriting({ id: item.id, value: sortItemText(block, item, lang, defaultLang) });
              }
            : undefined
        }
        editing={
          writing
            ? {
                id: writing.id,
                value: writing.value,
                onChange: (value) => setWriting({ id: writing.id, value }),
                onCommit: commitWriting,
                onCancel: () => {
                  writingRef.current = null;
                  setWriting(null);
                },
              }
            : null
        }
        onAddText={selected && onUpdate ? addText : undefined}
        onAddImage={selected && onUpdate ? addImage : undefined}
        rootRef={rootRef}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const itemId = pictureOf.current;
          pictureOf.current = null;
          const adding = addingPicture.current;
          addingPicture.current = false;
          if (!file || !pageId) return;
          if (adding) addSortImage({ kind: "page", pageId }, block.id, file).catch((error) => console.error(error));
          else if (itemId) setSortImage({ kind: "page", pageId }, block.id, itemId, file).catch((error) => console.error(error));
        }}
      />
    </>
  );
}
