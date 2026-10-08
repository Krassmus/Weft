import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { showWarning } from "./io/fileIO";

/** A .weft file that was opened with Weft - already in the library, or the reason it isn't (see src-tauri/src/open_files.rs). */
interface OpenedFile {
  name: string;
  path: string | null;
  error: string | null;
}

/**
 * "In Weft öffnen": a .weft file handed to the app by the system (a tap in the Files app, AirDrop, a mail attachment) is opened.
 * `ready` is waited for first: at launch the app reopens what was open last, and the file that started the app must not be
 * replaced by that. Whatever came in earlier is fetched once, whatever comes in later announces itself. `open` opens a path of
 * the library (and asks first if something would be lost - see EditorShell.tsx). Returns a function that stops listening.
 */
export function startOpenFiles(ready: Promise<unknown>, open: (path: string) => void): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;

  async function takeAndOpen() {
    const files = await invoke<OpenedFile[]>("take_pending_open_files").catch(() => []);
    for (const file of files) {
      if (file.path) open(file.path);
      else await showWarning(`„${file.name}“ ließ sich nicht öffnen: ${file.error ?? "unbekannter Fehler"}`, "In Weft öffnen");
    }
  }

  void (async () => {
    await ready;
    if (stopped) return;
    await takeAndOpen();
    const off = await listen("weft://open-file", () => void takeAndOpen());
    if (stopped) off();
    else unlisten = off;
  })();

  return () => {
    stopped = true;
    unlisten?.();
  };
}
