import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./fileIO";
import { fromStoredPath, toStoredPath } from "./library";

/** How many files "Datei > Zuletzt geöffnet" offers. */
export const MAX_RECENT_FILES = 10;
const RECENT_KEY = "weft:recentFiles";

/** The files opened or saved last, newest first. In localStorage rather than anywhere in a module: it is
 * about this computer's use of Weft (and, like the path of the file open last, nothing the app can't do
 * without - whatever can't be read is an empty list). */
export function readRecentFiles(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((path): path is string => typeof path === "string").slice(0, MAX_RECENT_FILES).map(fromStoredPath) : [];
  } catch {
    return [];
  }
}

function writeRecentFiles(paths: string[]): string[] {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(paths.map(toStoredPath)));
  } catch {
    // Not fatal - the menu just starts empty next time.
  }
  return paths;
}

/** Puts `path` first in the list (null: the document has no file, nothing changes). Returns the list. */
export function rememberRecentFile(path: string | null): string[] {
  const current = readRecentFiles();
  if (!path || current[0] === path) return current;
  return writeRecentFiles([path, ...current.filter((other) => other !== path)].slice(0, MAX_RECENT_FILES));
}

/** Takes `path` off the list (a file that is gone). Returns the list. */
export function forgetRecentFile(path: string): string[] {
  return writeRecentFiles(readRecentFiles().filter((other) => other !== path));
}

/** Tells the native menu (see set_recent_files in src-tauri/src/lib.rs) which files to offer. */
export function syncRecentMenu(paths: string[]): void {
  if (!isTauri()) return;
  void invoke("set_recent_files", { paths }).catch(() => {
    // A menu that is briefly out of date isn't worth an error.
  });
}
