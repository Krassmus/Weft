import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { buildCodeThemeCss, codeThemeClass } from "../../../core/code/codeThemes";
import { highlightCodeToHtml } from "../../../core/code/highlight";
import { applyTab } from "../../../core/code/indent";
import type { CodeBlock } from "../../../core/types";

const THEME_STYLE_ID = "weft-code-themes";
// How long after the last keystroke the typed code is committed to the document. Short enough that
// a save (manual or automatic) never misses text still being typed, long enough that a burst of
// typing is one undo step rather than one per character.
const COMMIT_DELAY_MS = 500;

/** The editor shows blocks of any theme side by side (canvas, thumbnails, sidebar), so every theme's
 * scoped CSS is simply present once, from the first code block on. */
function ensureThemeStyles() {
  if (document.getElementById(THEME_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = THEME_STYLE_ID;
  style.textContent = buildCodeThemeCss();
  document.head.appendChild(style);
}

/** The font size as CSS: stored as px on a 960px-wide slide, applied as a share of the slide's own
 * width (cqw) so it scales with it - player.runtime.js writes the exact same thing. */
export function codeFontSize(px: number): string {
  return `${+(px / 9.6).toFixed(3)}cqw`;
}

/**
 * A code block's content: highlighted text, and - while `editable` (the block is selected) - the
 * code typed straight into it. The text is edited in a plain <textarea> laid exactly over the
 * highlighted copy underneath (same font, padding and line breaks, its own text made invisible, so
 * only the caret and selection show), which is what gives live highlighting without a rich-text
 * editor and without any way to format anything. Both live in one scroll box, so a long listing
 * scrolls as a whole. Typing is committed to the document (one undo step per burst) shortly after
 * it pauses, when focus leaves, and when the block goes away - so no save ever misses it.
 */
export function CodeView({
  block,
  editable,
  onCommit,
}: {
  block: CodeBlock;
  editable: boolean;
  onCommit?: (code: string) => void;
}) {
  ensureThemeStyles();
  const [draft, setDraft] = useState(block.code);
  const focused = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Whatever changed the block from outside (undo, ...) wins - unless the user is typing right now.
  useEffect(() => {
    if (!focused.current) setDraft(block.code);
  }, [block.code]);

  useEffect(() => {
    if (editable) textareaRef.current?.focus();
  }, [editable]);

  // Always the latest, for the commits below that run from timers/cleanups rather than renders.
  const latest = useRef({ draft, savedCode: block.code, onCommit });
  latest.current = { draft, savedCode: block.code, onCommit };

  function commitNow() {
    const { draft: current, savedCode, onCommit: commit } = latest.current;
    if (current !== savedCode) commit?.(current);
  }

  useEffect(() => {
    if (draft === block.code) return;
    const timer = setTimeout(commitNow, COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Deselecting the block removes the textarea, and no blur is delivered for a removed element -
  // so that moment (and the block itself going away) commits whatever was still being typed.
  useEffect(() => {
    if (editable) return;
    commitNow();
    focused.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  useEffect(
    () => () => {
      if (focused.current) commitNow();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Writing a new value into a controlled textarea moves its caret to the end, so the selection an
  // edit wants (see applyTab) is applied right after React has written the value - before paint,
  // not on some later frame that could race with it.
  const pendingSelection = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    if (!pendingSelection.current) return;
    textareaRef.current?.setSelectionRange(...pendingSelection.current);
    pendingSelection.current = null;
  }, [draft]);

  const html = useMemo(() => highlightCodeToHtml(draft, block.language), [draft, block.language]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    // Tab indents (as in any code editor) instead of moving focus out of the block: the selected
    // lines when several are selected, Shift+Tab takes the indent back (see applyTab).
    if (e.key !== "Tab") return;
    e.preventDefault();
    const textarea = e.currentTarget;
    const edit = applyTab(textarea.value, textarea.selectionStart, textarea.selectionEnd, e.shiftKey);
    if (edit.value === textarea.value) {
      // Nothing to change (e.g. nothing left to outdent) - no re-render will follow to wait for.
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      return;
    }
    pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
    setDraft(edit.value);
  }

  return (
    <div
      className={`weft-code ${codeThemeClass(block.theme)}${block.transparentBackground ? " weft-code-transparent" : ""}`} 
      style={{ fontSize: codeFontSize(block.fontSize) }}
    >
      <div className="weft-code-stack">
        {/* The trailing newline keeps the last line's height identical to the textarea's, which always
            reserves a line after a final line break. */}
        <pre className="weft-code-pre" aria-hidden dangerouslySetInnerHTML={{ __html: html + "\n" }} />
        {!draft && <div className="weft-code-placeholder">Code eingeben …</div>}
        {editable && (
          <textarea
            ref={textareaRef}
            className="weft-code-input"
            value={draft}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              commitNow();
            }}
          />
        )}
      </div>
    </div>
  );
}
