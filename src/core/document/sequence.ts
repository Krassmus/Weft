import type { Branch, SequenceEntry, UUID, WeftModule } from "../types";
import { orderedKeys, orderedValues } from "./ordering";

/** The main sequence in playing order (see WeftModule.sequence). */
export function sequenceOf(content: Pick<WeftModule, "sequence">): SequenceEntry[] {
  return orderedValues(content.sequence);
}

/** The ids of a branch's pages in playing order (see Branch.pages). */
export function branchPageIds(branch: Pick<Branch, "pages">): UUID[] {
  return orderedKeys(branch.pages);
}

/** The key a sequence entry is stored under: the id of the page / logic block it stands for. */
export function sequenceKey(node: { kind: "page"; pageId: UUID } | { kind: "logic"; logicBlockId: UUID }): UUID {
  return node.kind === "page" ? node.pageId : node.logicBlockId;
}
