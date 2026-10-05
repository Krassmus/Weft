import { useDocumentStore } from "../document/store";
import { isTauri, saveDocumentToPath, saveRecoveryCopy } from "./fileIO";

// Saved this long after the LAST edit - a pause in typing/dragging, so it never packs the module
// halfway through a gesture - but never later than MAX_WAIT_MS after the FIRST unsaved edit, so a
// long, uninterrupted editing streak can't postpone it indefinitely.
const IDLE_DELAY_MS = 2000;
const MAX_WAIT_MS = 15000;
// After a failed attempt (disk full, file gone, ...) try again this much later.
const RETRY_DELAY_MS = 30000;

/**
 * Keeps whatever is open saved in the background: once the document has unsaved changes (see
 * DocumentState.savedContent), it is written out shortly after - to its own file if it has one
 * (exactly what Speichern would do), or to the recovery copy if it was never saved at all. Only
 * ever runs when something actually changed. Saving is asynchronous end to end (pack.ts zips in a
 * worker), so the editor stays usable while it happens; edits made during a save simply count as
 * unsaved again and trigger the next one.
 *
 * `onFailure` is told about the FIRST failure of a streak only, not about each retry - one
 * message is enough to know autosaving isn't working, a dialog every 30 seconds would be worse
 * than the problem. Returns a function that stops it. Desktop (Tauri) only: the browser has no
 * file to write to.
 */
export function startAutosave(onFailure: (error: unknown) => void): () => void {
  if (!isTauri()) return () => {};
  const stopFlushing = () => {
    flushAutosave = async () => {};
  };

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let failing = false;
  let lastError: unknown;
  // The attempt currently under way, so flush() can wait for it instead of starting a second.
  let inFlight: Promise<void> | null = null;

  function clearTimers() {
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
    idleTimer = undefined;
    maxTimer = undefined;
  }

  function isDirty(): boolean {
    const { doc, savedContent } = useDocumentStore.getState();
    return doc.content !== savedContent;
  }

  function schedule(idleMs: number) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(run, idleMs);
    if (maxTimer === undefined) maxTimer = setTimeout(run, MAX_WAIT_MS);
  }

  function run(): Promise<void> {
    clearTimers();
    if (saving || !isDirty()) return inFlight ?? Promise.resolve();
    inFlight = attempt();
    return inFlight;
  }

  async function attempt() {
    saving = true;
    // Snapshot first: what gets written (and then marked as saved) is exactly this, whatever the
    // user changes while the write is under way.
    const { doc, filePath } = useDocumentStore.getState();
    try {
      if (filePath) await saveDocumentToPath(doc, filePath);
      else await saveRecoveryCopy(doc);
      useDocumentStore.getState().markSaved(doc.content);
      failing = false;
    } catch (error) {
      console.error("Autosave failed:", error);
      lastError = error;
      if (!failing) onFailure(error);
      failing = true;
    } finally {
      saving = false;
      inFlight = null;
      if (isDirty()) schedule(failing ? RETRY_DELAY_MS : IDLE_DELAY_MS);
    }
  }

  // Writes out whatever is still unsaved right now - waiting for a save already under way first -
  // and only resolves once nothing is left; rejects if that's impossible (the caller is about to
  // quit and has to decide what to do about it).
  flushAutosave = async () => {
    clearTimers();
    while (inFlight) await inFlight;
    if (!isDirty()) return;
    await run();
    if (isDirty()) throw lastError ?? new Error("Autosave did not complete");
  };

  const unsubscribe = useDocumentStore.subscribe((state, previous) => {
    if (state.doc.content === previous.doc.content && state.savedContent === previous.savedContent) return;
    if (state.doc.content === state.savedContent) {
      // Back in sync (a save finished, or a document was just loaded) - nothing left to write.
      if (!saving) clearTimers();
      return;
    }
    if (!saving && !failing) schedule(IDLE_DELAY_MS);
  });

  return () => {
    unsubscribe();
    clearTimers();
    stopFlushing();
  };
}

/** Saves everything that is still unsaved and resolves once it is on disk (immediately when there
 * is nothing to save, or when autosaving isn't running - e.g. in a browser). Rejects if saving
 * fails. Called when the app is about to close - see EditorShell.tsx. */
export let flushAutosave: () => Promise<void> = async () => {};
