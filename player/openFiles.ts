import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** A .weft file that was opened with the app - already in the library, or the reason it isn't (see src-tauri/src/open_files.rs, which this app shares with Weft). */
interface OpenedFile {
  name: string;
  path: string | null;
  error: string | null;
}

/**
 * "Open in Weft Player": a .weft file that the system hands to the app (a tap on an attachment in Mail or a messenger, the Files app, AirDrop) comes
 * into the library on the native side; this finds out about it - what came in before the page was listening (the file that started the app), and
 * what comes in later (the page is told). Same as src/core/openFiles.ts, but a failure is reported through `failed` and not by the editor's dialog.
 * Returns a function that stops listening.
 */
export function startOpenFiles(opened: (path: string) => void, failed: (name: string, error: string) => void): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;

  async function takeAndOpen() {
    const files = await invoke<OpenedFile[]>("take_pending_open_files").catch(() => []);
    for (const file of files) {
      if (file.path) opened(file.path);
      else failed(file.name, file.error ?? "");
    }
  }

  void (async () => {
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
