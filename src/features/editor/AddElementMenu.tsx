import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addBlockToLayout, addBlockToPage } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import { tr } from "../../core/i18n/tr";
import { BLOCK_KIND_KEYS } from "../../core/i18n/translations";
import { useTranslation } from "../../core/i18n/useTranslation";
import type { Block, StaticBlock } from "../../core/types";
import { BlockKindIcon } from "./BlockKindIcon";

type Kind = Block["kind"];

/** The elements that only show something, and the ones the learner does something with - the two columns of the menu. */
const PRESENTATION_KINDS: Kind[] = ["text", "image", "code", "tex", "iframe", "video", "audio", "shape", "arrow", "list", "progress", "placeholder"];
const INTERACTIVE_KINDS: Kind[] = ["button", "link", "revealer", "quiz", "checker", "matching", "files", "cloze", "language", "script"];

const MENU_WIDTH = 340;

/**
 * The "+" in the toolbar over the slide: a menu of the element types that can be added to the slide being edited (or, while a layout is
 * edited, to the layout) - on the left the ones that only present something, on the right the interactive ones. The new element is
 * selected, so that its panel is what comes up.
 */
export function AddElementMenu({ container }: { container: { kind: "page"; pageId: string } | { kind: "layout"; layoutId: string } }) {
  const { t } = useTranslation();
  const select = useDocumentStore((s) => s.select);
  const languageCount = useDocumentStore((s) => s.doc.content.languages.length);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inLayout = container.kind === "layout";

  // What a slide can hold: no placeholder (they are the layout's). What a layout can: nothing that needs an answer.
  const allowed = (kind: Kind) => {
    if (kind === "language") return languageCount > 1;
    if (inLayout) return kind !== "quiz" && kind !== "cloze" && kind !== "checker" && kind !== "matching" && kind !== "script";
    return kind !== "placeholder";
  };
  const presentation = PRESENTATION_KINDS.filter(allowed);
  const interactive = INTERACTIVE_KINDS.filter(allowed);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - MENU_WIDTH - 8)), top: anchor.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function add(kind: Kind) {
    setOpen(false);
    const blockId = container.kind === "page" ? addBlockToPage(container.pageId, kind) : addBlockToLayout(container.layoutId, kind as StaticBlock["kind"]);
    select({ type: "block", container, blockId });
  }

  const column = (title: string, kinds: Kind[]) => (
    <div className="weft-add-elements-column">
      <span className="weft-add-elements-title">{title}</span>
      {kinds.map((kind) => (
        <button key={kind} type="button" className="weft-add-elements-item" onClick={() => add(kind)}>
          <BlockKindIcon kind={kind} />
          {t(BLOCK_KIND_KEYS[kind])}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="weft-canvas-add-button"
        title={tr("ui.add_element")}
        aria-label={tr("ui.add_element")}
        aria-expanded={open}
        onClick={() => {
          setPosition(null);
          setOpen((o) => !o);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="weft-add-elements"
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, width: MENU_WIDTH, visibility: position ? "visible" : "hidden" }}
          >
            {column(tr("ui.elements_presentation"), presentation)}
            {interactive.length > 0 && column(tr("ui.elements_interactive"), interactive)}
          </div>,
          document.body,
        )}
    </>
  );
}
