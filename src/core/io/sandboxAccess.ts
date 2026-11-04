import { invoke } from "@tauri-apps/api/core";

/**
 * The Mac App Store version of the app runs in the App Sandbox: it may only touch what the person has chosen, and only until it is
 * quit. After every file or folder the person chooses (an open or save dialog, the shared folder) this tells the app to keep the access
 * for the next start (see src-tauri/src/sandbox.rs), so that "Zuletzt geöffnet", the autosave and the folder sync keep working.
 * Everywhere else (a browser, the other desktop versions, the tablet) the command does nothing - and it is never an error.
 */
export function keepAccess(path: string | null | undefined): void {
  if (!path || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void invoke("grant_access", { path }).catch(() => {
    // Not fatal: the file simply has to be chosen again next time.
  });
}
