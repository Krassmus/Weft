export const INDENT = "  ";

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * What Tab / Shift+Tab does in a code editor, on plain text with a selection:
 * - Tab with a caret or a selection inside ONE line inserts an indent at the selection (replacing
 *   it), exactly like typing;
 * - Tab with a selection spanning several lines indents every one of those lines (blank ones are
 *   left alone), and the selection keeps covering the same text;
 * - Shift+Tab outdents the line(s) the caret/selection touches by up to one indent (or one tab).
 * A selection that ends right at the start of a line doesn't count that line, like in an IDE.
 */
export function applyTab(value: string, selectionStart: number, selectionEnd: number, outdent: boolean): TextEdit {
  const multiLine = value.slice(selectionStart, selectionEnd).includes("\n");
  if (!outdent && !multiLine) {
    const next = value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd);
    const caret = selectionStart + INDENT.length;
    return { value: next, selectionStart: caret, selectionEnd: caret };
  }

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lastIncluded = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  const newlineAfter = value.indexOf("\n", lastIncluded);
  const lineEnd = newlineAfter === -1 ? value.length : newlineAfter;

  const lines = value.slice(lineStart, lineEnd).split("\n");
  const deltas: number[] = [];
  const changed = lines.map((line) => {
    if (!outdent) {
      if (line.length === 0) return (deltas.push(0), line);
      deltas.push(INDENT.length);
      return INDENT + line;
    }
    const removable = line.startsWith("\t") ? 1 : (line.match(/^ {1,2}/)?.[0].length ?? 0);
    deltas.push(-removable);
    return line.slice(removable);
  });
  const total = deltas.reduce((sum, d) => sum + d, 0);

  const next = value.slice(0, lineStart) + changed.join("\n") + value.slice(lineEnd);
  // A selection starting at a line's very start stays there when indenting (the indent lands
  // inside it); otherwise it follows its text. Outdenting can never pull it before its line.
  const start = outdent
    ? Math.max(lineStart, selectionStart + deltas[0])
    : selectionStart === lineStart
      ? selectionStart
      : selectionStart + deltas[0];
  const end = selectionStart === selectionEnd ? start : selectionEnd + total;
  return { value: next, selectionStart: start, selectionEnd: end };
}
