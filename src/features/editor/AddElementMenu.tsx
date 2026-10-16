import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { addBlockToLayout, addBlockToPage } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import { tr } from "../../core/i18n/tr";
import { BLOCK_KIND_KEYS } from "../../core/i18n/translations";
import { useTranslation } from "../../core/i18n/useTranslation";
import type { Block, StaticBlock } from "../../core/types";

type Kind = Block["kind"];

/** The elements that only show something, and the ones the learner does something with - the two columns of the menu. */
const PRESENTATION_KINDS: Kind[] = ["text", "image", "code", "tex", "iframe", "video", "shape", "arrow", "list", "placeholder"];
const INTERACTIVE_KINDS: Kind[] = ["button", "quiz", "files", "cloze", "language"];

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: Record<Kind, ReactNode> = {
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />,
  tex: <path d="M18 5H7l6 7-6 7h11" />,
  iframe: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  shape: (
    <>
      <circle cx="9" cy="9" r="5" />
      <rect x="11" y="11" width="9" height="9" rx="1.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  placeholder: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 3" />
      <path d="M8 12h8" />
    </>
  ),
  button: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <path d="M8 12h8" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
    </>
  ),
  files: <path d="M6 3h8l4 4v14H6zM14 3v4h4M12 11v6m-3-3 3 3 3-3" />,
  cloze: <path d="M3 8h5M14 8h7M3 16h9M17 16h4M8 12h8" />,
  language: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
};

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
    if (inLayout) return kind !== "quiz" && kind !== "cloze";
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
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
            {ICONS[kind]}
          </svg>
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
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}>
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
