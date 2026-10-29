/**
 * The gaps of a gap text (ClozeBlock): in its text, `[[Berlin]]` is a blank whose right answer is "Berlin"; `[[Berlin|Hauptstadt]]` has
 * two right answers. A marker is recognised when it stands in ONE text node - formatting in the middle of it (`[[Ber<b>lin</b>]]`)
 * splits it, like a {{variable}}; the panel lists what was recognised, so that an author sees it. How a gap text is drawn and its answers are judged is in
 * blocks/cloze/render.js - the player and the editor use the same.
 */

import { CLOZE_MARKER } from "../blocks/cloze/render.js";

export { CLOZE_MARKER, clozeAllowedSlips as allowedSlips, clozeIsRight, clozeLevenshtein as levenshtein } from "../blocks/cloze/render.js";

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
