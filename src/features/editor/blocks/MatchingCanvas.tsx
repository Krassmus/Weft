import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Block, MatchItem, MatchingBlock } from "../../../core/types";
import { useDocumentStore } from "../../../core/document/store";
import { setMatchingImage } from "../../../core/document/filesActions";
import { matchingItemText, matchingItemTextPatch } from "../../../core/document/translations";
import { useEditingLanguage } from "../useEditingLanguage";
import { MatchingView } from "./MatchingView";
import type { MatchingDrag } from "./MatchingView";
import { useWritingEnd } from "./useWritingEnd";

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * A matching on the canvas: every card of both lists can be moved on the area with the pointer - once the block is selected (before that a press
 * on it moves the block, like with any other). While a card is dragged only the picture moves; the block is changed once, when the pointer is let
 * go, so that a move is one step of the history. A double click on a text card writes its words in place (Enter or leaving the field keeps them, one
 * step of the history, in the editing language; Escape drops them); on a picture card it asks for another picture.
 */
export function MatchingCanvas({ block, selected, onUpdate }: { block: MatchingBlock; selected: boolean; onUpdate?: (patch: Partial<Block>) => void }) {
  const { lang, defaultLang } = useEditingLanguage();
  const [drag, setDrag] = useState<MatchingDrag | null>(null);
  // A double click on a picture asks for another file for it (the field is hidden, the click opens the chooser). A matching lives on pages.
  const pageId = useDocumentStore((s) => Object.values(s.doc.content.pages).find((page) => block.id in page.blocks)?.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const pictureOf = useRef<string | null>(null);
  const [writing, setWriting] = useState<{ id: string; value: string } | null>(null);
  const writingRef = useRef(writing);
  writingRef.current = writing;
  function commitWriting() {
    const current = writingRef.current;
    setWriting(null);
    writingRef.current = null;
    if (!current || !onUpdate) return;
    const item = [...block.sources, ...block.targets].find((it) => it.id === current.id);
    if (item && current.value !== matchingItemText(block, item, lang, defaultLang)) onUpdate(matchingItemTextPatch(block, current.id, lang, defaultLang, current.value));
  }
  useWritingEnd(writing !== null, selected, commitWriting);

  function start(event: ReactPointerEvent, item: MatchItem, side: "source" | "target") {
    if (!selected || event.button !== 0 || !onUpdate) return;
    event.stopPropagation();
    event.preventDefault();
    const area = (event.currentTarget as HTMLElement).closest(".weft-matching-area") as HTMLElement | null;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const size = side === "source" ? block.sourceSize : block.targetSize;
    const startX = event.clientX;
    const startY = event.clientY;
    let last: MatchingDrag | null = null;
    const move = (e: PointerEvent) => {
      const x = clamp(item.x + ((e.clientX - startX) / rect.width) * 100, 0, 100 - size.width);
      const y = clamp(item.y + ((e.clientY - startY) / rect.height) * 100, 0, 100 - size.height);
      last = { id: item.id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
      setDrag(last);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      if (!last) return;
      const placed = last;
      const set = (items: MatchItem[]) => items.map((it) => (it.id === placed.id ? { ...it, x: placed.x, y: placed.y } : it));
      onUpdate(side === "source" ? { sources: set(block.sources) } : { targets: set(block.targets) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <>
      <MatchingView
        block={block}
        lang={lang}
        defaultLang={defaultLang}
        drag={drag}
        onCardPointerDown={selected ? start : undefined}
        onCardDoubleClick={
          selected && onUpdate
            ? (item) => {
                if (item.kind === "image") {
                  pictureOf.current = item.id;
                  fileInput.current?.click();
                } else setWriting({ id: item.id, value: matchingItemText(block, item, lang, defaultLang) });
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
          if (file && itemId && pageId) setMatchingImage({ kind: "page", pageId }, block.id, itemId, file).catch((error) => console.error(error));
        }}
      />
    </>
  );
}
