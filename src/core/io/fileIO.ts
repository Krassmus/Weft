import { confirm as confirmNative, message as messageNative, open, save } from "@tauri-apps/plugin-dialog";
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

/** Re-opens a specific, already-known path with no dialog - used to restore the last-opened
 * module on launch (see EditorShell.tsx). Only meaningful in Tauri (a browser has no way to
 * silently re-read an arbitrary local path without the user picking it via a dialog each time,
 * which is exactly what this is trying to avoid), so it's a no-op outside it. Lets a stale path
 * (the file since moved, renamed, or deleted) fail with a plain thrown error rather than
 * swallowing it - the caller decides how to handle that not being available anymore. */
export async function openDocumentAtPath(path: string): Promise<WeftDocument | null> {
  if (!isTauri()) return null;
  const bytes = await readFile(path);
  return unpackDocument(bytes);
}

const FONT_MIME_TYPES: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

function fontMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return FONT_MIME_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Opens a native file picker for a font upload - through Tauri's own dialog/fs plugins when
 * running as the desktop app, exactly like openDocument() above, rather than a hidden
 * <input type="file">.click(). That approach (see BlockPanel.tsx's font-family <select>, which
 * offers "Eigene Schriftart hochladen …" as one of its own options) turned out not to work in
 * Tauri's WKWebView: calling .click() on a file input from inside another control's change
 * handler isn't a "direct enough" user gesture for it to honor, so the dialog silently never
 * opened. Going through the same open()/readFile() pair openDocument() already uses sidesteps
 * that restriction entirely, since it's a Tauri IPC call rather than a DOM click at all.
 */
export async function pickFontFile(): Promise<File | null> {
  if (isTauri()) {
    const path = await open({
      title: "Schriftart auswählen",
      multiple: false,
      filters: [{ name: "Schriftart", extensions: ["woff2", "woff", "ttf", "otf"] }],
    });
    if (!path || Array.isArray(path)) return null;
    const bytes = await readFile(path);
    const fileName = path.split(/[\\/]/).pop() ?? "font";
    return new File([bytes], fileName, { type: fontMimeType(fileName) });
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".woff2,.woff,.ttf,.otf";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/**
 * Confirmation prompt for a destructive action - Tauri's own dialog plugin when running as the
 * desktop app, not the browser's built-in window.confirm(). WKWebView (the macOS webview Tauri
 * embeds) doesn't reliably surface confirm()'s native alert sheet - it can fail to appear, or
 * appear detached from the app window - the same class of issue as the file-input .click() one
 * pickFontFile() above works around. Tauri's dialog plugin shows a real, native OS dialog
 * instead, so it isn't affected.
 */
export async function confirmDestructive(message: string, title: string): Promise<boolean> {
  if (isTauri()) return confirmNative(message, { title, kind: "warning" });
  return window.confirm(message);
}

async function showWarning(text: string, title: string): Promise<void> {
  if (isTauri()) {
    await messageNative(text, { title, kind: "warning" });
    return;
  }
  window.alert(text);
}

/** One video upload that ended up not confirmed playable - see warnUnplayableVideo. */
export interface UnplayableVideo {
  fileName: string;
  /** Whether resolvePlayableVideo (document/actions.ts) found a local ffmpeg and actually tried
   * converting this file before giving up - distinguishes "no ffmpeg to try" (the actionable
   * case: installing one fixes it for every future upload) from "ffmpeg ran and the result
   * still wasn't confirmed playable" (rarer - a genuinely exotic file, or the conversion itself
   * failed). */
  ffmpegAttempted: boolean;
  /** Whatever ffmpeg itself (or finding it) actually said, when available - surfaced verbatim
   * rather than only logged, since a silent "nothing happened, no idea why" is exactly the
   * failure mode this exists to avoid. */
  error?: string;
}

/**
 * A heads-up for a video file this browser couldn't decode at all (see probeVideo in
 * document/actions.ts) - most commonly an iPhone/Mac export in HEVC/H.265, which only Safari
 * can play back (Apple licenses it; Chrome/Firefox and Windows/Linux generally can't), so it
 * looks fine to whoever uploaded it but silently fails to play for most everyone else the
 * exported module ends up in front of. Doesn't block adding the file - a false positive from a
 * slow load or an unusual environment would otherwise be a hard stop for no reason - just flags
 * it so the author finds out now rather than after exporting.
 */
export async function warnUnplayableVideo(videos: UnplayableVideo[]): Promise<void> {
  const list = videos.map((v) => `„${v.fileName}“`).join(", ");
  const subject = videos.length === 1 ? "konnte" : "konnten";
  const anyAttempted = videos.some((v) => v.ffmpegAttempted);
  const errors = videos
    .filter((v) => v.error)
    .map((v) => `${videos.length > 1 ? `${v.fileName}: ` : ""}${v.error}`)
    .join("\n");
  const suggestion = anyAttempted
    ? "Die automatische Konvertierung mit ffmpeg hat es leider auch nicht spielbar gemacht - bitte die Datei " +
      "extern konvertieren, z. B. mit HandBrake oder „Exportieren als …“ in QuickTime, und erneut hochladen." +
      (errors ? `\n\nMeldung von ffmpeg:\n${errors}` : "")
    : "Weft kann Videos automatisch nach H.264 konvertieren, sobald ffmpeg installiert ist - z. B. mit " +
      "„brew install ffmpeg“ (Terminal) oder von ffmpeg.org. Bis dahin bitte die Datei extern konvertieren, " +
      "z. B. mit HandBrake oder „Exportieren als …“ in QuickTime, und erneut hochladen.";
  await showWarning(
    `${list} ${subject} in diesem Browser nicht abgespielt werden - vermutlich ein nicht unterstützter ` +
      `Codec (z. B. HEVC/H.265 statt H.264/AAC). ${suggestion}`,
    "Video möglicherweise nicht abspielbar",
  );
}
