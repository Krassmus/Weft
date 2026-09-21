import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import type { WeftDocument } from "../types";
import { packDocument } from "./pack";
import { unpackDocument } from "./unpack";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function slugify(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "lernmodul";
}

// Save and export both produce the exact same archive (see pack.ts), down to sharing this one
// compound extension. Note this is a naming convention only - macOS (and Windows) resolve a
// file's type solely by the text after the *last* dot, so a "*.weft.zip" file is, as far as the
// OS is concerned, just a ".zip" file with an unusual name. It can't be double-click-associated
// with Weft specifically without hijacking plain .zip files too, so opening one still goes
// through "Öffnen" in the app rather than the OS.
const WEFT_EXTENSION = "weft.zip";

function suggestedFileName(title: string): string {
  return `${slugify(title)}.${WEFT_EXTENSION}`;
}

async function writeBytes(bytes: Uint8Array, suggestedName: string, dialogTitle: string) {
  if (isTauri()) {
    const path = await save({
      title: dialogTitle,
      defaultPath: suggestedName,
      // The dialog filter only ever matches on the final extension - "weft.zip" already ends in
      // "zip", so this both validates correctly and won't offer plain ".zip" as a separate choice.
      filters: [{ name: "Weft-Lernmodul", extensions: ["zip"] }],
    });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}

export async function saveDocumentAs(doc: WeftDocument): Promise<string | null> {
  const bytes = await packDocument(doc);
  return writeBytes(bytes, suggestedFileName(doc.content.title), "Lernmodul speichern");
}

/** Overwrites a known path directly, no dialog - "Speichern" once a document already has one
 * (from a prior save or from opening a file), matching how Save works in most other apps. */
export async function saveDocumentToPath(doc: WeftDocument, path: string): Promise<void> {
  const bytes = await packDocument(doc);
  await writeFile(path, bytes);
}

export async function exportAsHtmlModule(doc: WeftDocument): Promise<string | null> {
  const bytes = await packDocument(doc);
  return writeBytes(bytes, suggestedFileName(doc.content.title), "Lernmodul exportieren");
}

export async function openDocument(): Promise<{ doc: WeftDocument; path: string | null } | null> {
  if (isTauri()) {
    // Both old standalone .weft files and the new .weft.zip / plain-export .zip are all just
    // zip archives underneath (unpackDocument doesn't care about the name), so all three stay
    // openable here.
    const path = await open({ multiple: false, filters: [{ name: "Weft-Lernmodul", extensions: ["weft", "zip"] }] });
    if (!path || Array.isArray(path)) return null;
    const bytes = await readFile(path);
    return { doc: unpackDocument(bytes), path };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".weft,.zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      resolve({ doc: unpackDocument(bytes), path: null });
    };
    input.click();
  });
}
