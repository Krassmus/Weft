import type { WeftModule } from "../types";
import { branchPageIds, sequenceOf } from "./sequence";

/** The letter of the n-th branch (0 = "a"): a, b, ... z, then aa, ab, ... */
function branchLetter(index: number): string {
  let letter = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) letter = String.fromCharCode(97 + (n % 26)) + letter;
  return letter;
}

/**
 * The name a page goes by in the sidebar's numbering, by page id: "3" for the third entry of the main sequence, "2.a.1" for the
 * first page of the first branch of the logic block that is the second entry (the numbers are those of the sidebar - a logic
 * block counts as an entry of its own).
 */
export function pageLabels(content: WeftModule): Record<string, string> {
  const labels: Record<string, string> = {};
  sequenceOf(content).forEach((node, index) => {
    if (node.kind === "page") {
      labels[node.pageId] = String(index + 1);
      return;
    }
    content.logicBlocks[node.logicBlockId]?.branches.forEach((branch, branchIndex) => {
      branchPageIds(branch).forEach((pageId, pageIndex) => {
        labels[pageId] = `${index + 1}.${branchLetter(branchIndex)}.${pageIndex + 1}`;
      });
    });
  });
  return labels;
}
