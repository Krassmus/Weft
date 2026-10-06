import type { DocHandle } from "@automerge/automerge-repo";
import { Automerge } from "./automerge";
import { sharesOrigin } from "./origin";
import { currentHandle, repo, useDocumentStore } from "../document/store";
import { importArchiveAssets, unpackDocument } from "../io/unpack";
import type { WeftModule } from "../types";

export type MergeResult =
  | { ok: true; newChanges: number }
  | { ok: false; reason: "unreadable" | "no-history" | "other-module" | "no-common-origin" };

/**
 * Merges another copy of the module being edited - the editing history of a .weft file somebody
 * else changed (see HISTORY_FILE in io/pack.ts) - into it. Nothing is replaced: what the other copy
 * changed is added to this one, and what both changed is combined the way simultaneous edits are
 * (see core/document/ordering.ts and the module comment of collab/session.ts). Only copies of the
 * same document can be merged: they must share their beginning, which they do when both go back to
 * one file that was saved by this version of Weft - two people who each opened an older file (without
 * a history) of the same module have unrelated histories, and merging those would pit every single
 * field against its twin.
 */
export function mergeHistory(binary: Uint8Array): MergeResult {
  return mergeHistoryInto(currentHandle(), binary);
}

/** mergeHistory for any document, not just the one being edited. */
export function mergeHistoryInto(handle: DocHandle<WeftModule>, binary: Uint8Array): MergeResult {
  let other: Automerge.Doc<WeftModule>;
  try {
    other = Automerge.load<WeftModule>(binary);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const mine = handle.doc();
  if (other.id !== mine.id) return { ok: false, reason: "other-module" };
  if (!sharesOrigin(other, mine)) return { ok: false, reason: "no-common-origin" };

  const before = Automerge.getAllChanges(mine).length;
  const otherHandle = repo.import<WeftModule>(binary);
  handle.merge(otherHandle);
  repo.delete(otherHandle.documentId);
  return { ok: true, newChanges: Automerge.getAllChanges(handle.doc()).length - before };
}

/** mergeHistory for a whole .weft file: reads it, merges its history and - only once that worked -
 * takes over its images, videos and fonts too (those the merged module references and this copy
 * doesn't have yet). */
export function mergeDocumentFile(zipBytes: Uint8Array): MergeResult {
  let history: Uint8Array | undefined;
  try {
    history = unpackDocument(zipBytes, { importAssets: false }).history;
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!history) return { ok: false, reason: "no-history" };
  const result = mergeHistory(history);
  if (result.ok) importArchiveAssets(zipBytes, useDocumentStore.getState().doc.content);
  return result;
}
