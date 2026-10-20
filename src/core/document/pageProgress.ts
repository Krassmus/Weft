import type { WeftModule } from "../types";
import { branchPageIds, sequenceOf } from "./sequence";

/**
 * The value of the virtual variable `progress` on a page, worked out without playing: for the PDF, the pictures of the slides and the
 * editor, which cannot know which way a learner took. The same sum as the player's progressValue (player.runtime.js): round up
 * (visited / (visited + remaining) * 100), "visited" being the pages on the way up to and including this one, "remaining" the most that
 * can follow it. A jump page is not a page (the player never shows it).
 *
 * Where the way depends on a choice - a page behind a logic block - the longest branch of every logic block before it is taken as the
 * one that was walked, the same assumption "remaining" makes for the ones ahead: the value is the one a learner on the longest way sees.
 * Returns null for a page that is not in the module's sequence (a deleted page, a layout).
 */
export function pageProgress(content: Pick<WeftModule, "sequence" | "pages" | "logicBlocks">, pageId: string): number | null {
  const isPage = (id: string) => !!content.pages[id] && !content.pages[id].jump;
  const entries = sequenceOf(content);
  const longestBranch = (logicBlockId: string) =>
    Math.max(0, ...(content.logicBlocks[logicBlockId]?.branches ?? []).map((branch) => branchPageIds(branch).filter(isPage).length));
  // How many pages one entry adds to the way (a logic block: its longest branch).
  const size = (entry: (typeof entries)[number]) => (entry.kind === "page" ? (isPage(entry.pageId) ? 1 : 0) : longestBranch(entry.logicBlockId));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    let before = 0; // pages on the way before the one the page is in (or before the page itself, for a top-level page)
    for (let k = 0; k < i; k++) before += size(entries[k]);
    let after = 0; // pages that can still follow, past the page's own branch
    for (let k = i + 1; k < entries.length; k++) after += size(entries[k]);

    if (entry.kind === "page") {
      if (entry.pageId !== pageId || !isPage(pageId)) continue;
      return percent(before + 1, after);
    }
    for (const branch of content.logicBlocks[entry.logicBlockId]?.branches ?? []) {
      const own = branchPageIds(branch).filter(isPage);
      const at = own.indexOf(pageId);
      if (at >= 0) return percent(before + at + 1, own.length - at - 1 + after);
    }
  }
  return null;
}

function percent(visited: number, remaining: number): number {
  return Math.ceil((visited * 100) / (visited + remaining));
}
