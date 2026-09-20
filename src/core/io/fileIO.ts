import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import type { WeftDocument } from "../types";
import { packDocument } from "./pack";
import { unpackDocument } from "./unpack";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function slugify(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "lernmodul";
}

async function writeBytes(bytes: Uint8Array, suggestedName: string, dialogTitle: string, extension: string) {
  if (isTauri()) {
    const path = await save({
      title: dialogTitle,
      defaultPath: suggestedName,
      filters: [{ name: suggestedName, extensions: [extension] }],
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
  return writeBytes(bytes, `${slugify(doc.content.title)}.weft`, "Lernmodul speichern", "weft");
}

export async function exportAsHtmlModule(doc: WeftDocument): Promise<string | null> {
  const bytes = await packDocument(doc);
  return writeBytes(bytes, `${slugify(doc.content.title)}.zip`, "Als HTML-Lernmodul exportieren", "zip");
}

export async function openDocument(): Promise<{ doc: WeftDocument; path: string | null } | null> {
  if (isTauri()) {
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
