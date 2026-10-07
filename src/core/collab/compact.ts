import { currentHandle, startFreshHistory } from "../document/store";
import { plain } from "../document/plain";
import type { WeftModule } from "../types";
import { Automerge } from "./automerge";
import { stopFolderSync } from "./folder/folderSession";
import { disableLiveCollaboration } from "./session";

export interface HistoryStats {
  /** How many changes the history is made of. */
  changes: number;
  /** What the module takes up with its history, as saved (bytes). */
  bytes: number;
  /** What it would take up without (bytes). */
  compactedBytes: number;
}

/** The size of the open module's editing history, and what it would shrink to. Packs the module twice,
 * so not something to run on every keystroke. */
export function historyStats(): HistoryStats {
  const doc = currentHandle().doc() as Automerge.Doc<WeftModule>;
  return {
    changes: Automerge.getAllChanges(doc).length,
    bytes: Automerge.save(doc).length,
    compactedBytes: Automerge.save(Automerge.from(plain(doc) as unknown as Record<string, unknown>)).length,
  };
}

/**
 * Drops the editing history of the open module: it goes on from its current state with a new, short
 * history (see startFreshHistory). Every earlier version of every text - including what was deleted -
 * is gone from the file; the cost is that copies of the module that were made before can no longer be
 * merged into it. So whatever ties the open module to such copies ends first: the live connection, and the
 * shared folder (whose files are of the old history); to work together again, switch "Datei als
 * Einladung" on again and hand out the new file.
 */
export function compactHistory(): void {
  stopFolderSync(true);
  disableLiveCollaboration();
  startFreshHistory();
}
