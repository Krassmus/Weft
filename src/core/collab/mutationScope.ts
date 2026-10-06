import { isDraft } from "immer";
import { Automerge } from "./automerge";

let depth = 0;

/** Runs a document change. Inside it the objects read from the document are live proxies that change
 * under a cache's feet, so memoized derivations (orderedValues, getPageLanes) must not be used. */
export function runMutation<T>(fn: () => T): T {
  depth++;
  try {
    return fn();
  } finally {
    depth--;
  }
}

/** Whether `object` (a collection or page of the document) is a fixed snapshot that a memoized
 * derivation of it may be cached for: an Automerge document state, or a frozen object (what an
 * Immer edit produces) - and not while a change is running, nor a draft or a plain object that is
 * still being filled in (a document that has just been parsed, a migration). */
export function isSnapshot(object: object): boolean {
  if (depth > 0 || isDraft(object)) return false;
  return Object.isFrozen(object) || Automerge.getObjectId(object) !== null;
}
