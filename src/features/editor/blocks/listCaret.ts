/**
 * The caret helpers behind the keyboard of a list on the canvas (see ListBlockCanvas in BlockView.tsx): where the caret is in one
 * item's editable text, and how to put it somewhere in another. Plain DOM - the items are contentEditable elements.
 */

/** The collapsed selection's range inside `el`, or null (nothing selected there, or a range of several characters). */
function caretRange(el: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return el.contains(range.startContainer) ? range : null;
}

/** Whether the (collapsed) caret stands at the very start / end of the text of `el`. */
export function caretAt(el: HTMLElement, where: "start" | "end"): boolean {
  const range = caretRange(el);
  if (!range) return false;
  const probe = document.createRange();
  if (where === "start") {
    probe.setStart(el, 0);
    probe.setEnd(range.startContainer, range.startOffset);
  } else {
    probe.setStart(range.startContainer, range.startOffset);
    probe.setEnd(el, el.childNodes.length);
  }
  return probe.toString().length === 0 && !probe.cloneContents().querySelector("img,br");
}

const LINE_EPSILON_PX = 2;

/** The top of the text line of every rect the contents of `range` take up. */
function lineTops(range: Range): number[] {
  return Array.from(range.getClientRects())
    .filter((rect) => rect.height > 0)
    .map((rect) => rect.top);
}

/** Whether the caret is on the first / last line of the text of `el` (with a text of one line: both). */
export function caretOnLine(el: HTMLElement, line: "first" | "last"): boolean {
  const range = caretRange(el);
  if (!range) return false;
  const all = document.createRange();
  all.selectNodeContents(el);
  const tops = lineTops(all);
  if (tops.length === 0) return true;
  const first = Math.min(...tops);
  const last = Math.max(...tops);
  // The line the caret is on: the lowest line of what is before it.
  const before = document.createRange();
  before.setStart(el, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const beforeTops = lineTops(before);
  const caretTop = beforeTops.length > 0 ? Math.max(...beforeTops) : first;
  return line === "first" ? caretTop <= first + LINE_EPSILON_PX : caretTop >= last - LINE_EPSILON_PX;
}

/** The x position of the caret (px in the window), if it can be told. */
export function caretX(el: HTMLElement): number | null {
  const range = caretRange(el);
  if (!range) return null;
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0].left;
  // A caret that stands between two elements has no rectangle of its own: the text before it says where it is.
  const before = document.createRange();
  before.setStart(el, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const lastRect = Array.from(before.getClientRects()).pop();
  return lastRect ? lastRect.right : null;
}

function placeCaret(range: Range) {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** The point of `el`'s text that is `offset` characters in (clamped to its end) as a collapsed range. */
function rangeAtTextOffset(el: HTMLElement, offset: number): Range {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null = walker.nextNode();
  let last: Text | null = null;
  while (node) {
    const length = node.nodeValue?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      return range;
    }
    remaining -= length;
    last = node as Text;
    node = walker.nextNode();
  }
  if (last) {
    range.setStart(last, last.nodeValue?.length ?? 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  return range;
}

/** The length of the text of `el`, in characters (what rangeAtTextOffset counts in). */
export function textLength(el: HTMLElement): number {
  return el.textContent?.length ?? 0;
}

/**
 * Focuses `el` and puts the caret in it: at its "start" or "end", `{ offset }` characters in, or - going up or down from another
 * item - as near as possible to the horizontal position `x` on its first / last line.
 */
export function focusItem(
  el: HTMLElement,
  where: "start" | "end" | { offset: number } | { x: number | null; line: "first" | "last" },
): void {
  el.focus();
  if (where === "start" || where === "end") {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(where === "start");
    placeCaret(range);
    return;
  }
  if ("offset" in where) {
    placeCaret(rangeAtTextOffset(el, where.offset));
    return;
  }
  // By position: the text line at the near edge, the x of the caret we come from.
  const contents = document.createRange();
  contents.selectNodeContents(el);
  const tops = lineTops(contents);
  const rects = Array.from(contents.getClientRects()).filter((rect) => rect.height > 0);
  if (where.x === null || rects.length === 0) {
    focusItem(el, where.line === "first" ? "start" : "end");
    return;
  }
  const rect = where.line === "first" ? rects.find((r) => r.top === Math.min(...tops)) : rects.find((r) => r.top === Math.max(...tops));
  const y = (rect ? rect.top + rect.height / 2 : el.getBoundingClientRect().top + 2);
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(where.x, y);
  else if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(where.x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }
  if (range && el.contains(range.startContainer)) placeCaret(range);
  else focusItem(el, where.line === "first" ? "start" : "end");
}
