import { useLayoutEffect, useRef } from "react";
import { checkerText } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { CheckerBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import checkboxUncheckedSvg from "../../../../mockups/icons/checkbox-unchecked.svg?raw";

/** A checker as it is drawn - the canvas and the thumbnails (what the player makes of it is in player.runtime.js: renderCheckerBlock). The box is
 * shown empty, as a learner meets it, and nothing here can be clicked. It uses the look of a quiz's one answer and its button
 * (App.css, .weft-thumb-block-quiz-*), which follow the style of the module's interactive elements. On the canvas of a selected block the words can be
 * written in place (CheckerCanvas gives `onTextDoubleClick` and `editing`). */
export function CheckerView({
  block,
  lang,
  defaultLang,
  onTextDoubleClick,
  editing,
}: {
  block: CheckerBlock;
  lang: string | null;
  defaultLang: string | null;
  /** Given on the canvas of a selected block: a double click on the words (to write them in place). */
  onTextDoubleClick?: () => void;
  /** The words being written in place: shown as a field instead. */
  editing?: { value: string; onChange: (value: string) => void; onCommit: () => void; onCancel: () => void } | null;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // The field is as high as its text - again when the block is scaled (the text then changes its size and where it breaks its lines).
  const writing = editing !== null && editing !== undefined;
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [editing?.value, writing]);
  return (
    <div className="weft-thumb-block-quiz weft-checker-view">
      <div className="weft-thumb-block-quiz-options">
        <div className="weft-thumb-block-quiz-option">
          <span className="weft-thumb-block-quiz-option-checkbox" dangerouslySetInnerHTML={{ __html: checkboxUncheckedSvg }} />
          {editing ? (
            <textarea
              ref={field}
              className="weft-thumb-block-quiz-option-text weft-checker-edit"
              rows={1}
              value={editing.value}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => editing.onChange(e.target.value)}
              onBlur={editing.onCommit}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                // (Enter keeps the words; a line break is Shift+Enter.)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  editing.onCommit();
                } else if (e.key === "Escape") editing.onCancel();
              }}
            />
          ) : (
            <span className="weft-thumb-block-quiz-option-text weft-checker-view-text" onDoubleClick={onTextDoubleClick}>
              {checkerText(block, lang, defaultLang)}
            </span>
          )}
        </div>
      </div>
      <div className="weft-thumb-block-quiz-submit">
        <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
        {playerStringsFor(lang).submit}
      </div>
    </div>
  );
}
