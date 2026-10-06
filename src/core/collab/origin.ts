import { Automerge } from "./automerge";

/** The hash of a document's first change: copies that go back to the same document share it. */
function originOf(doc: Automerge.Doc<unknown>): string | null {
  const first = Automerge.getAllChanges(doc)[0];
  return first ? Automerge.decodeChange(first).hash : null;
}

/** Whether two documents are copies of one another - they begin with the same change - and so can be
 * merged without every field of one fighting its twin in the other. */
export function sharesOrigin(a: Automerge.Doc<unknown>, b: Automerge.Doc<unknown>): boolean {
  return originOf(a) === originOf(b);
}
