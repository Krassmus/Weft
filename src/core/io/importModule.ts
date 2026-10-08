import { unzipSync } from "fflate";
import { tempDir } from "@tauri-apps/api/path";
import { remove } from "@tauri-apps/plugin-fs";
import { runsInTauri } from "../platform";
import { pickDocumentFile } from "./fileIO";
import { importIntoLibrary } from "./library";
import { isPlayerArchive } from "./playerFile";

/** Whether this is a Weft file at all: a module (weft.json) or a player file. */
function isModuleArchive(bytes: Uint8Array): boolean {
  try {
    return "weft.json" in unzipSync(bytes, { filter: (file) => file.name === "weft.json" }) || isPlayerArchive(bytes);
  } catch {
    return false;
  }
}

/**
 * "Aus Dateien importieren": the person picks a module in the Files app (or anywhere the picker reaches) and gets a copy of
 * it in the library; returns its path, or null if nothing was picked. The picker hands the app a copy of its own to begin
 * with (which is removed again afterwards) - the original is never touched.
 */
export async function importModuleFromFiles(): Promise<string | null> {
  const picked = await pickDocumentFile("Lernmodul importieren");
  if (!picked) return null;
  try {
    if (!isModuleArchive(picked.bytes)) throw new Error("Das ist keine Weft-Datei.");
    return await importIntoLibrary(picked.bytes, picked.name);
  } finally {
    // Only ever the copy: what is in the app's own temporary folder - never a path that might be the person's original.
    if (picked.path && runsInTauri() && picked.path.startsWith((await tempDir()).replace(/\/+$/, "") + "/")) await remove(picked.path).catch(() => undefined);
  }
}
