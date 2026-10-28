import { useLayoutEffect, useRef, useState } from "react";
import type { Block, CheckerBlock } from "../../../core/types";
import { fieldWording, fieldWordingPatch } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { useEditingLanguage } from "../useEditingLanguage";
import { CHECKER_ICONS, CheckerView } from "./CheckerView";
import { useWritingEnd } from "./useWritingEnd";

/**
 * A checker on the canvas: the picture the player draws it with (CheckerView) - and once the block is selected (before that a press on it moves the
 * block, like with any other), a double click on its words writes them in place: in the editing language, one step of the history; Enter or leaving the
 * field keeps them, Escape drops them. While the words are written the block is drawn here, by hand, with the same classes (a field cannot be put into the
 * picture the shared function draws - which is only ever a picture).
 */
export function CheckerCanvas({ block, selected, onUpdate }: { block: CheckerBlock; selected: boolean; onUpdate?: (patch: Partial<Block>) => void }) {
  const { lang, defaultLang } = useEditingLanguage();
  const [writing, setWriting] = useState<string | null>(null);
  const writingRef = useRef(writing);
  writingRef.current = writing;
  function commit() {
    const value = writingRef.current;
    setWriting(null);
    writingRef.current = null;
    if (value !== null && onUpdate && value !== fieldWording(block, "text", lang, defaultLang)) onUpdate(fieldWordingPatch(block, "text", lang, defaultLang, value) as Partial<Block>);
  }
  useWritingEnd(writing !== null, selected, commit);

  if (writing !== null) {
    return (
      <CheckerWriting
        value={writing}
        submitWord={playerStringsFor(lang).submit}
        onChange={setWriting}
        onCommit={commit}
        onCancel={() => {
          writingRef.current = null;
          setWriting(null);
        }}
      />
    );
  }
  return (
    <div
      style={{ width: "100%", height: "100%" }}
      // (The picture is inert, so the press lands here: only the words start the writing.)
      onDoubleClick={
        selected && onUpdate
          ? (event) => {
              const words = event.currentTarget.querySelector(".weft-checker-text")?.getBoundingClientRect();
              if (words && event.clientX >= words.left && event.clientX <= words.right && event.clientY >= words.top && event.clientY <= words.bottom) {
                setWriting(fieldWording(block, "text", lang, defaultLang));
              }
            }
          : undefined
      }
    >
      <CheckerView block={block} lang={lang} defaultLang={defaultLang} mode="edit" />
    </div>
  );
}

/** The checker as renderChecker draws it, with a field where its words are - while they are written in place. */
function CheckerWriting({ value, submitWord, onChange, onCommit, onCancel }: { value: string; submitWord: string; onChange: (value: string) => void; onCommit: () => void; onCancel: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  // The field is as high as its text - again when the block is scaled (the text then changes its size and where it breaks its lines).
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
  }, [value]);
  return (
    <div className="weft-render-host is-writing">
      <form className="weft-quiz weft-checker" onSubmit={(e) => e.preventDefault()}>
        <div className="weft-quiz-options" role="group">
          <label className="weft-quiz-option">
            <span className="weft-quiz-option-checkbox">
              <input type="checkbox" className="weft-quiz-option-input" tabIndex={-1} />
              <span className="weft-quiz-option-checkbox-icon weft-quiz-option-checkbox-icon-unchecked" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CHECKER_ICONS.unchecked }} />
              <span className="weft-quiz-option-checkbox-icon weft-quiz-option-checkbox-icon-checked" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CHECKER_ICONS.checked }} />
            </span>
            <textarea
              ref={field}
              className="weft-quiz-option-text weft-checker-text weft-checker-edit"
              rows={1}
              value={value}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onCommit}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                // (Enter keeps the words; a line break is Shift+Enter.)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onCommit();
                } else if (e.key === "Escape") onCancel();
              }}
            />
          </label>
        </div>
        <button type="button" className="weft-quiz-submit" tabIndex={-1}>
          <span className="weft-quiz-submit-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CHECKER_ICONS.submit }} />
          {submitWord}
        </button>
      </form>
    </div>
  );
}
