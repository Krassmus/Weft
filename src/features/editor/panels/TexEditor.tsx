import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import editIconSvg from "../../../../mockups/icons/maximize.svg?raw";
import { renderTexToHtml } from "../../../core/tex/renderTex";
import type { TexBlock } from "../../../core/types";
import { useTexDialog } from "../blocks/texDialogStore";
import { Collapsible } from "../Collapsible";
import { tr } from "../../../core/i18n/tr";
import { ColorField } from "../ColorField";
import { useBackdropClose } from "../useBackdropClose";
import { useDialogA11y } from "../useDialogA11y";

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
      <Collapsible title={tr("ui.formula")}>
        <div className="weft-tex-source-header">
          <span>{tr("ui.tex")}</span>
          <button
            type="button"
            className="weft-icon-button"
            title={tr("ui.edit_in_a_larger_window")}
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
        <p className="weft-hint">{tr("ui.tex_line_break_align")}</p>
        <label className="weft-field weft-field-inline">
          <span>{tr("ui.colour_of_the_formula")}</span>
          <ColorField value={block.color || "#000000"} isDefault={!block.color} onReset={() => onUpdate({ color: "" })} onChange={(color) => onUpdate({ color })} />
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
      <ColorField title={tr("ui.colour_for_the_selection")} value={color} onChange={setColor} />
      <button
        type="button"
        className="weft-ghost-button"
        title={tr("ui.colour_the_selected_part")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrapSelection(`{\\color{${color}} `, "}")}
      >
        {tr("ui.colour_the_selection")}
      </button>
      <button
        type="button"
        className="weft-ghost-button"
        title={tr("ui.make_the_selected_part_bold")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrapSelection("\\boldsymbol{", "}")}
      >
        <b>{tr("ui.bold")}</b>
      </button>
    </div>
  );
}

/** Opened by double-clicking a TeX block or via TexEditor's icon: the same source field with room
 * to breathe, plus a larger, natural-size preview underneath (the slide itself always shows the
 * formula scaled to its box, which would make a short formula look huge here). */
function TexDialog({ block, onUpdate, onClose }: { block: TexBlock; onUpdate: Update; onClose: () => void }) {
  const backdropClose = useBackdropClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);
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
    <div className="weft-modal-backdrop" {...backdropClose}>
      <div ref={dialogRef} className="weft-modal weft-tex-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>{tr("ui.tex_formula")}</h3>
          <button type="button" className="weft-icon-button" title={tr("ui.close")} aria-label={tr("ui.close")} onClick={onClose}>
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
        <p className="weft-hint">{tr("ui.tex_line_break_close")}</p>
      </div>
    </div>,
    document.body,
  );
}
