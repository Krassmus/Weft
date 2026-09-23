import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../io/fileIO";
import { useResolvedLanguage } from "./languageStore";

/** Keeps the native "Datei"/"File" menu and the "Einstellungen…"/"Settings…" item in whatever
 * language is currently resolved - the menu itself is built in Rust (see src-tauri/src/lib.rs),
 * which has no way to know about a preference stored in the webview's localStorage on its own,
 * so the frontend tells it via this command every time the resolved language changes (including
 * once on mount, since Rust's own initial menu is built before it's heard from either window at
 * all). macOS's menu bar is a single app-wide bar rather than one per window, so it doesn't
 * matter which window happens to call this - used by both EditorShell and the settings window
 * so whichever one is running keeps it current. */
export function useSyncMenuLanguage(): void {
  const lang = useResolvedLanguage();
  useEffect(() => {
    if (!isTauri()) return;
    void invoke("set_menu_language", { lang }).catch(() => {
      // A menu that's briefly in the wrong language isn't worth surfacing an error for.
    });
  }, [lang]);
}
