/**
 * The gaps of a gap text (ClozeBlock): in its text, `[[Berlin]]` is a blank whose right answer is "Berlin"; `[[Berlin|Hauptstadt]]` has
 * two right answers. A marker is recognised when it stands in ONE text node - formatting in the middle of it (`[[Ber<b>lin</b>]]`)
 * splits it, like a {{variable}}; the panel lists what was recognised, so that an author sees it. Kept in sync by hand with
 * player.runtime.js, which cannot import this.
 */

/** The marker, as the player and the editor look for it in one text node. */
export const CLOZE_MARKER = /\[\[([^\[\]]+)\]\]/g;

/** One blank of a text: what stands between the brackets (`key`, also what the effects of this answer are stored under) and
 * the right answers it allows. */
export interface ClozeBlank {
  key: string;
  answers: string[];
}

function answersOf(key: string): string[] {
  return key
    .split("|")
    .map((answer) => answer.trim())
    .filter((answer) => answer.length > 0);
}

/** The blanks of `html` in the order they stand in. */
export function clozeBlanks(html: string): ClozeBlank[] {
  if (!html.includes("[[")) return [];
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const blanks: ClozeBlank[] = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    for (const match of (walker.currentNode.nodeValue ?? "").matchAll(CLOZE_MARKER)) {
      const key = match[1].trim();
      const answers = answersOf(key);
      if (answers.length > 0) blanks.push({ key, answers });
    }
  }
  return blanks;
}

/** The number of single-character changes (insert, delete, replace) that turn `a` into `b`. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** What counts as the same: spaces do not count at all (1 714 is 1714, "New York" is "NewYork"), capital letters only if they are asked for. */
function normalise(text: string, caseSensitive: boolean): string {
  const trimmed = text.replace(/\s+/g, "");
  return caseSensitive ? trimmed : trimmed.toLocaleLowerCase();
}

/** How many wrong characters are put up with for an answer of this length: `tolerance` at most, and none for a very short one
 * (with "Rom" and one allowed slip, "Ram" is a different word as much as a typo). */
export function allowedSlips(answerLength: number, tolerance: number): number {
  if (tolerance <= 0) return 0;
  return answerLength > tolerance * 2 ? tolerance : 0;
}

/** Whether `given` is one of the right `answers`. */
export function clozeIsRight(given: string, answers: string[], caseSensitive: boolean, tolerance: number): boolean {
  const typed = normalise(given, caseSensitive);
  if (typed.length === 0) return false;
  return answers.some((answer) => {
    const wanted = normalise(answer, caseSensitive);
    return levenshtein(typed, wanted) <= allowedSlips(wanted.length, tolerance);
  });
}

/** `html` with every blank (as far as it is written in one piece) replaced by an empty box of about the width of its answer - what a
 * thumbnail or the PDF shows of a gap text. */
export function clozeBlanksAsBoxes(html: string): string {
  return html.replace(/\[\[([^\[\]<>]+)\]\]/g, (_, key: string) => {
    const longest = Math.max(4, ...key.split("|").map((a) => a.trim().length));
    return `<span class="weft-cloze-blank" style="width:${Math.min(longest + 2, 24)}ch"></span>`;
  });
}
