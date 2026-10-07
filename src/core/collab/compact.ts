import { currentHandle, startFreshHistory } from "../document/store";
import { plain } from "../document/plain";
import type { WeftModule } from "../types";
import { applyPatches } from "./applyPatches";
import { Automerge } from "./automerge";
import { stopFolderSync } from "./folder/folderSession";
import { disableLiveCollaboration } from "./session";

/** From this much history on, shrinking it is offered (below that hardly anybody will mind). */
export const COMPACT_OFFER_BYTES = 500 * 1024;
/** What is left of the history after shrinking: the most recent changes, as many as fit in this. */
export const COMPACT_KEEP_BYTES = 400 * 1024;

export interface HistoryStats {
  /** How many changes the history is made of. */
  changes: number;
  /** What the module takes up with its history, as saved (bytes). */
  bytes: number;
  /** What it would take up without (bytes). */
  compactedBytes: number;
  /** What the history itself takes up (bytes): the difference. */
  historyBytes: number;
}

/** The size of the open module's editing history, and what it would shrink to. Packs the module twice,
 * so not something to run on every keystroke. */
export function historyStats(): HistoryStats {
  const doc = currentHandle().doc() as Automerge.Doc<WeftModule>;
  const bytes = Automerge.save(doc).length;
  const compactedBytes = Automerge.save(Automerge.from(plain(doc) as unknown as Record<string, unknown>)).length;
  return { changes: Automerge.getAllChanges(doc).length, bytes, compactedBytes, historyBytes: Math.max(0, bytes - compactedBytes) };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => key in b && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * A copy of `doc` that remembers only its last `count` changes: it starts from what the document
 * looked like before them, and those changes are made again on top (as the patches Automerge reports
 * when they are applied), so the content is the same and the history is the recent part of the old
 * one. Not every one of them on its own, but in a few hundred steps (it takes a while; the page stays
 * usable in between, which is why it's async). Null if the result doesn't come out the same (or a change can't be
 * repeated).
 */
async function replayLast(doc: Automerge.Doc<WeftModule>, changes: Automerge.Change[], count: number): Promise<Automerge.Doc<WeftModule> | null> {
  const cut = changes.length - count;
  let walker = Automerge.applyChanges(Automerge.init<WeftModule>(), changes.slice(0, cut))[0];
  let copy = Automerge.from(plain(walker) as unknown as Record<string, unknown>) as Automerge.Doc<WeftModule>;
  const step = Math.ceil(count / 300);
  for (let from = cut; from < changes.length; from += step) {
    let patches: Automerge.Patch[] = [];
    walker = Automerge.applyChanges(walker, changes.slice(from, from + step), { patchCallback: (reported) => (patches = reported) })[0];
    if (patches.length > 0) copy = Automerge.change(copy, (draft) => applyPatches(draft, patches));
    await new Promise((resolve) => setTimeout(resolve));
  }
  return sameValue(plain(copy), plain(doc)) ? copy : null;
}

/**
 * The history of the open module cut down to its most recent part: the largest number of the last
 * changes whose history takes up about COMPACT_KEEP_BYTES. Null if there is nothing to cut (the history
 * is that small already) or it can't be done - then the history goes entirely.
 */
async function recentHistory(doc: Automerge.Doc<WeftModule>, stats: HistoryStats): Promise<Uint8Array | null> {
  if (stats.historyBytes <= COMPACT_KEEP_BYTES) return null;
  const changes = Automerge.getAllChanges(doc);
  const sizes = changes.map((change) => change.length);
  // How much raw change data goes into the history that is kept: a first guess from how well the
  // whole history packs, corrected by what each try really comes to once it is saved.
  let rawBudget = (COMPACT_KEEP_BYTES * 0.96 * sizes.reduce((sum, size) => sum + size, 0)) / stats.historyBytes;
  let best: { bytes: Uint8Array; used: number } | null = null;
  const tried = new Set<number>();
  for (let attempt = 0; attempt < 4; attempt++) {
    let count = 0;
    let raw = 0;
    while (count < sizes.length - 1 && raw + sizes[sizes.length - 1 - count] <= rawBudget) raw += sizes[sizes.length - 1 - count++];
    if (count === 0 || tried.has(count)) break;
    tried.add(count);
    const copy = await replayLast(doc, changes, count);
    if (!copy) return best?.bytes ?? null;
    const bytes = Automerge.save(copy);
    const used = Math.max(1, bytes.length - stats.compactedBytes);
    if (used <= COMPACT_KEEP_BYTES && (!best || used > best.used)) best = { bytes, used };
    if (used <= COMPACT_KEEP_BYTES && used >= COMPACT_KEEP_BYTES * 0.8) break;
    rawBudget *= (COMPACT_KEEP_BYTES / used) * 0.96;
  }
  return best?.bytes ?? null;
}

/**
 * Cuts the editing history of the open module down: it goes on from its current state with a new
 * history of its own that holds only the most recent changes (about COMPACT_KEEP_BYTES of it; see
 * startFreshHistory). Every earlier version of every text - including what was deleted - is gone from
 * the file; the cost is that copies of the module that were made before can no longer be merged into
 * it. So whatever ties the open module to such copies ends first: the live connection, and the shared
 * folder (whose files are of the old history); to work together again, switch "Datei als Einladung"
 * on again and hand out the new file. False if the module was changed meanwhile (nothing is done then).
 */
export async function compactHistory(): Promise<boolean> {
  const doc = currentHandle().doc() as Automerge.Doc<WeftModule>;
  let keep: Uint8Array | null = null;
  try {
    keep = await recentHistory(doc, historyStats());
  } catch {
    // a change that can't be repeated: the history goes entirely
  }
  // Somebody (the author, a collaborator) changed the module while the copy was being made: it
  // would be missing that - nothing happens, and it can be started again.
  const now = currentHandle().doc() as Automerge.Doc<WeftModule>;
  if (Automerge.getHeads(now).join() !== Automerge.getHeads(doc).join()) return false;
  stopFolderSync(true);
  disableLiveCollaboration();
  startFreshHistory(keep ?? undefined);
  return true;
}
