import type { WeftModule } from "../types";
import { branchPageIds, sequenceOf } from "./sequence";

/**
 * Where a slide goes when it is moved with the keyboard (Alt + arrow keys in the slide list) - one step at a time, the moves of the
 * sidebar's drag and drop without the mouse:
 * - "up" / "down": one place in the list it is in (the main sequence or its branch); the end of the list stops it.
 * - "in" (→): a slide of the main sequence goes into the branching directly below it (the top of its first branch) - or, with none
 *   there, directly above it (the end of its last branch). A slide in a branch goes into the next branch (the same place, at most the
 *   end), and out of the last branch it leaves the branching: behind it, in the main sequence.
 * - "out" (←): the mirror - to the previous branch; out of the first branch it leaves the branching: before it.
 */
export type SlideMove = "up" | "down" | "in" | "out";

/** What a move does, for its name in a menu and for the message that tells it. */
export type SlideMoveKind = "up" | "down" | "into-branching" | "next-branch" | "previous-branch" | "leave-after" | "leave-before";

export type SlideContainer = { kind: "top" } | { kind: "branch"; logicBlockId: string; branchId: string };

export interface SlideMovePlan {
  kind: SlideMoveKind;
  container: SlideContainer;
  /** Where to put it: the place in `container`'s list once the slide is out of the one it was in (see movePageTo). */
  index: number;
}

export function planSlideMove(content: WeftModule, pageId: string, move: SlideMove): SlideMovePlan | null {
  const sequence = sequenceOf(content);
  const top = sequence.findIndex((node) => node.kind === "page" && node.pageId === pageId);
  if (top !== -1) {
    if (move === "up") return top > 0 ? { kind: "up", container: { kind: "top" }, index: top - 1 } : null;
    if (move === "down") return top < sequence.length - 1 ? { kind: "down", container: { kind: "top" }, index: top + 1 } : null;
    if (move === "out") return null;
    // Into a branching: the one below, else the one above.
    const below = sequence[top + 1];
    const above = sequence[top - 1];
    if (below?.kind === "logic") {
      const first = content.logicBlocks[below.logicBlockId]?.branches[0];
      return first ? { kind: "into-branching", container: { kind: "branch", logicBlockId: below.logicBlockId, branchId: first.id }, index: 0 } : null;
    }
    if (above?.kind === "logic") {
      const branches = content.logicBlocks[above.logicBlockId]?.branches ?? [];
      const last = branches[branches.length - 1];
      return last
        ? { kind: "into-branching", container: { kind: "branch", logicBlockId: above.logicBlockId, branchId: last.id }, index: branchPageIds(last).length }
        : null;
    }
    return null;
  }

  for (const [logicIndex, node] of sequence.entries()) {
    if (node.kind !== "logic") continue;
    const logicBlock = content.logicBlocks[node.logicBlockId];
    if (!logicBlock) continue;
    const branchIndex = logicBlock.branches.findIndex((branch) => branchPageIds(branch).includes(pageId));
    if (branchIndex === -1) continue;
    const branch = logicBlock.branches[branchIndex];
    const ids = branchPageIds(branch);
    const place = ids.indexOf(pageId);
    const inBranch = (target: (typeof logicBlock.branches)[number]): SlideContainer => ({
      kind: "branch",
      logicBlockId: logicBlock.id,
      branchId: target.id,
    });
    if (move === "up") return place > 0 ? { kind: "up", container: inBranch(branch), index: place - 1 } : null;
    if (move === "down") return place < ids.length - 1 ? { kind: "down", container: inBranch(branch), index: place + 1 } : null;
    if (move === "in") {
      const next = logicBlock.branches[branchIndex + 1];
      if (!next) return { kind: "leave-after", container: { kind: "top" }, index: logicIndex + 1 };
      return { kind: "next-branch", container: inBranch(next), index: Math.min(place, branchPageIds(next).length) };
    }
    const previous = logicBlock.branches[branchIndex - 1];
    if (!previous) return { kind: "leave-before", container: { kind: "top" }, index: logicIndex };
    return { kind: "previous-branch", container: inBranch(previous), index: Math.min(place, branchPageIds(previous).length) };
  }
  return null;
}
