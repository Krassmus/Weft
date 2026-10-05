import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import editIconSvg from "../../../../mockups/icons/maximize.svg?raw";
import { renderTexToHtml } from "../../../core/tex/renderTex";
import type { TexBlock } from "../../../core/types";
import { useTexDialog } from "../blocks/texDialogStore";
import { Collapsible } from "../Collapsible";

const DEFAULT_INSERT_COLOR = "#dc2626";

type Update = (patch: Partial<TexBlock>) => void;

/** Sidebar section for a TeX block: the formula source (live-previewed right on the slide), the
 * whole-block color, and the icon that opens the roomier editing dialog (TexDialog) - the same one
 * a double-click on the block itself opens. */
export function TexEditor({ block, onUpdate }: { block: TexBlock; onUpdate: Update }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogOpen = useTexDialog((s) => s.blockId === block.id);
  const openDialog = useTexDialog((s) => s.open);
  const closeDialog = useTexDialog((s) => s.close);

  return (
    <>
      <Collapsible title="Formel">
        <div className="weft-tex-source-header">
          <span>TeX</span>
          <button
            type="button"
            className="weft-icon-button"
            title="In größerem Fenster bearbeiten"
            onClick={() => openDialog(block.id)}
            dangerouslySetInnerHTML={{ __html: editIconSvg }}
          />
        </div>
        <textarea
          ref={textareaRef}
          className="weft-tex-source"
          rows={5}
          spellCheck={false}
          value={block.tex}
          onChange={(e) => onUpdate({ tex: e.target.value })}
        />
        <TexFormatBar textareaRef={textareaRef} tex={block.tex} onChange={(tex) => onUpdate({ tex })} />
        <p className="weft-hint">Zeilenumbruch mit \\ . Mehrzeilige Ausrichtung z. B. mit \begin&#123;aligned&#125; … \end&#123;aligned&#125;.</p>
        <label className="weft-field weft-field-inline">
          <span>Farbe der Formel</span>
          <input type="color" value={block.color || "#000000"} onChange={(e) => onUpdate({ color: e.target.value })} />
          {block.color && (
            <button type="button" className="weft-ghost-button" onClick={() => onUpdate({ color: "" })}>
              Zurücksetzen
            </button>
          )}
        </label>
      </Collapsible>
      {dialogOpen && <TexDialog block={block} onUpdate={onUpdate} onClose={closeDialog} />}
    </>
  );
}

/** Wraps whatever is currently selected in `textareaRef` (or inserts an empty wrapper at the
 * caret) - how a part of a formula gets a color or boldface without typing the TeX by hand. */
function TexFormatBar({
  textareaRef,
  tex,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  tex: string;
  onChange: (tex: string) => void;
}) {
  const [color, setColor] = useState(DEFAULT_INSERT_COLOR);

  function wrapSelection(before: string, after: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    onChange(tex.slice(0, start) + before + tex.slice(start, end) + after + tex.slice(end));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    });
  }

  return (
    <div className="weft-format-row weft-tex-format-bar">
      <input type="color" title="Farbe für die Markierung" value={color} onChange={(e) => setColor(e.target.value)} />
      <button
        type="button"
        className="weft-ghost-button"
        title="Markierten Teil einfärben"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrapSelection(`{\\color{${color}} `, "}")}
      >
        Auswahl einfärben
      </button>
      <button
        type="button"
        className="weft-ghost-button"
        title="Markierten Teil fett setzen"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrapSelection("\\boldsymbol{", "}")}
      >
        <b>Fett</b>
      </button>
    </div>
  );
}

/** Opened by double-clicking a TeX block or via TexEditor's icon: the same source field with room
 * to breathe, plus a larger, natural-size preview underneath (the slide itself always shows the
 * formula scaled to its box, which would make a short formula look huge here). */
function TexDialog({ block, onUpdate, onClose }: { block: TexBlock; onUpdate: Update; onClose: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="weft-modal-backdrop" onClick={onClose}>
      <div className="weft-modal weft-tex-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>TeX-Formel</h3>
          <button type="button" className="weft-icon-button" title="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="weft-tex-source weft-tex-source-large"
          rows={10}
          spellCheck={false}
          value={block.tex}
          onChange={(e) => onUpdate({ tex: e.target.value })}
        />
        <TexFormatBar textareaRef={textareaRef} tex={block.tex} onChange={(tex) => onUpdate({ tex })} />
        <div
          className="weft-tex-dialog-preview"
          style={block.color ? { color: block.color } : undefined}
          dangerouslySetInnerHTML={{ __html: block.tex.trim() ? renderTexToHtml(block.tex) : "" }}
        />
        <p className="weft-hint">Zeilenumbruch mit \\ . Schließen mit Esc oder Cmd/Strg+Enter.</p>
      </div>
    </div>,
    document.body,
  );
}
