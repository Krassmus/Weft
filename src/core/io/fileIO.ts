import { confirm as confirmNative, message as messageNative, open, save } from "@tauri-apps/plugin-dialog";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { mkdir, readFile, remove, rename, writeFile } from "@tauri-apps/plugin-fs";
import type { WeftDocument } from "../types";
import { mergeDocumentFile } from "../collab/merge";
import { useAssetStore } from "../assets/assetStore";
import { usedAssetIds } from "../document/usedAssets";
import { useDocumentStore } from "../document/store";
import { packDocument } from "./pack";
import { unpackDocument } from "./unpack";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function slugify(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "lernmodul";
}

// Save and export both produce the exact same archive (see pack.ts) - a plain zip file underneath
// regardless of what it's named. They differ in the extension the caller writes it under: Save
// uses the plain ".weft" extension, so a module can be shared as a single recognizable file (e.g.
// dropped into a WhatsApp chat) and later opened by a dedicated player app once one exists.
// Export keeps the existing ".weft.zip" double extension. Note this is a naming convention only -
// macOS (and Windows) resolve a file's type solely by the text after the *last* dot, so neither
// name can be double-click-associated with Weft specifically without hijacking plain .zip files
// too (for the exported ".weft.zip" case) - opening one still goes through "Öffnen" in the app
// rather than the OS.
const SAVE_EXTENSION = "weft";
const EXPORT_EXTENSION = "weft.zip";

function suggestedFileName(title: string, extension: string): string {
  return `${slugify(title)}.${extension}`;
}

async function writeBytes(bytes: Uint8Array, suggestedName: string, dialogTitle: string, filterExtension: string) {
  if (isTauri()) {
    const path = await save({
      title: dialogTitle,
      defaultPath: suggestedName,
      // The dialog filter only ever matches on the final extension - passing that same final
      // extension here both validates correctly and won't offer an unrelated choice (e.g. plain
      // ".zip") alongside it.
      filters: [{ name: "Weft-Lernmodul", extensions: [filterExtension] }],
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

// Manual saves and automatic ones (autosave.ts) can overlap - writes to disk go through one queue
// so two never interleave on the same file.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

/** Writes next to the target first and renames over it, so a crash or a full disk halfway through
 * leaves the previous version intact instead of a truncated file - which matters now that this
 * runs every few seconds in the background. Falls back to a plain overwrite if the rename isn't
 * possible (e.g. a permission the build doesn't have). */
async function writeFileSafely(path: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, path);
  } catch {
    await writeFile(path, bytes);
    await remove(temporaryPath).catch(() => {});
  }
}

export async function saveDocumentAs(doc: WeftDocument): Promise<string | null> {
  const bytes = await packDocument(doc);
  return writeBytes(bytes, suggestedFileName(doc.content.title, SAVE_EXTENSION), "Lernmodul speichern", SAVE_EXTENSION);
}

/** Overwrites a known path directly, no dialog - "Speichern" once a document already has one
 * (from a prior save or from opening a file), matching how Save works in most other apps. */
export async function saveDocumentToPath(doc: WeftDocument, path: string): Promise<void> {
  await serialized(async () => {
    let toWrite = doc;
    if (useDocumentStore.getState().live) {
      // A file of live collaboration is typically kept in a shared folder and saved by several people. What
      // a colleague has saved there since this copy last read it is merged in first, so that writing over
      // it never takes anything away - the file ends up holding everybody's work.
      try {
        mergeDocumentFile(await readFile(path));
        toWrite = useDocumentStore.getState().doc;
      } catch {
        // no file there yet, or not one that can be merged - just save
      }
    }
    await writeFileSafely(path, await packDocument(toWrite));
  });
}

// A module that has never been saved anywhere has no file for automatic saving to write to - its
// autosaves go to one fixed recovery file in the app's own cache folder instead, which is offered
// back on the next launch (see EditorShell.tsx) and deleted again as soon as the module gets a
// real file via Speichern.
const RECOVERY_FILE_NAME = "recovery.weft";

async function recoveryPath(): Promise<string> {
  const dir = await join(await appCacheDir(), "recovery");
  await mkdir(dir, { recursive: true });
  return join(dir, RECOVERY_FILE_NAME);
}

export async function saveRecoveryCopy(doc: WeftDocument): Promise<void> {
  const bytes = await packDocument(doc);
  const path = await recoveryPath();
  await serialized(() => writeFileSafely(path, bytes));
}

/** The module autosaved before its first real save, if there is one (and it still opens). */
export async function readRecoveryCopy(): Promise<WeftDocument | null> {
  if (!isTauri()) return null;
  try {
    return unpackDocument(await readFile(await recoveryPath()));
  } catch {
    return null;
  }
}

export async function clearRecoveryCopy(): Promise<void> {
  if (!isTauri()) return;
  try {
    await remove(await recoveryPath());
  } catch {
    // Nothing there (or not removable) - either way there's no stale copy left to act on.
  }
}

export async function exportAsHtmlModule(doc: WeftDocument): Promise<string | null> {
  const bytes = await packDocument(doc, { forExport: true });
  // The dialog filter matches only the final extension - "weft.zip" already ends in "zip", so the
  // filter itself is just "zip" (matching EXPORT_EXTENSION's own last segment).
  return writeBytes(bytes, suggestedFileName(doc.content.title, EXPORT_EXTENSION), "Lernmodul exportieren", "zip");
}

/** Lets the user pick any number of files of any kind (for a files block). */
export async function pickFilesFromDisk(title = "Dateien hinzufügen"): Promise<File[]> {
  if (isTauri()) {
    const picked = await open({ title, multiple: true });
    if (!picked) return [];
    const paths = Array.isArray(picked) ? picked : [picked];
    return Promise.all(
      paths.map(async (path) => {
        const name = path.split(/[\\/]/).pop() ?? "datei";
        return new File([(await readFile(path)) as BlobPart], name, { type: guessMimeType(name) });
      }),
    );
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** What the file type seems to be from its name (a file read from a path has none of its own). */
function guessMimeType(fileName: string): string {
  return MIME_BY_EXTENSION[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Lets the user pick a .weft / exported .weft.zip file and returns its raw bytes (and its path, in
 * the desktop app). */
export async function pickDocumentFile(title = "Lernmodul öffnen"): Promise<{ bytes: Uint8Array; path: string | null } | null> {
  if (isTauri()) {
    // .weft (saved), .weft.zip / plain .zip (exported) are all just zip archives underneath
    // (unpackDocument doesn't care about the name), so all of them stay openable here.
    const path = await open({ title, multiple: false, filters: [{ name: "Weft-Lernmodul", extensions: ["weft", "zip"] }] });
    if (!path || Array.isArray(path)) return null;
    return { bytes: await readFile(path), path };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".weft,.zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ bytes: new Uint8Array(await file.arrayBuffer()), path: null });
    };
    input.click();
  });
}

export async function openDocument(): Promise<{ doc: WeftDocument; path: string | null } | null> {
  const picked = await pickDocumentFile();
  return picked ? { doc: unpackDocument(picked.bytes), path: picked.path } : null;
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

export async function showWarning(text: string, title: string): Promise<void> {
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

/** From this size on, a video is called large (see warnLargeVideos). */
export const LARGE_VIDEO_BYTES = 50 * 1024 * 1024;

/** What an upload of one video came to - see VideoUploadResult in document/actions.ts. */
export interface VideoUploadReport {
  fileName: string;
  playable: boolean;
  ffmpegAttempted: boolean;
  error?: string;
  sizeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/** What the module's images, videos and fonts take up together (those still in use). */
function totalMediaBytes(): number {
  const used = usedAssetIds(useDocumentStore.getState().doc.content);
  const blobs = useAssetStore.getState().blobs;
  let total = 0;
  for (const id of used) total += blobs.get(id)?.size ?? 0;
  return total;
}

/**
 * A heads-up for a very large video: it is added all the same - plenty of modules need one - but its size
 * has consequences that the author otherwise only finds out about later: the saved file and the exported
 * module grow with it, everybody who works on the module together has to receive it first (and again
 * for everybody who joins), and learning platforms often limit how big an uploaded module may be.
 */
export async function warnLargeVideos(videos: { fileName: string; sizeBytes: number }[]): Promise<void> {
  const list = videos.map((v) => `„${v.fileName}“ (${formatSize(v.sizeBytes)})`).join(", ");
  await showWarning(
    `${list} ${videos.length === 1 ? "ist" : "sind"} ein großes Video. Es ist hinzugefügt, aber bedenke:\n\n` +
      "• Die gespeicherte Datei und das exportierte Lernmodul werden entsprechend groß.\n" +
      "• Beim gemeinsamen Arbeiten muss jede Person das Video erst empfangen - das dauert, auch für jeden, der später dazukommt.\n" +
      "• Viele Lernplattformen begrenzen die Größe eines hochgeladenen Lernmoduls.\n\n" +
      "Oft lässt sich ein Video mit geringerer Auflösung oder Bitrate stark verkleinern (z. B. mit HandBrake) - oder du bindest es von einem Videoportal als Iframe-Element ein.\n\n" +
      `Alle Medien im Lernmodul zusammen: ${formatSize(totalMediaBytes())}.`,
    "Großes Video",
  );
}

/** Everything worth telling the author about videos that were just added: those that may not play back
 * (see warnUnplayableVideo) first, then those that are very large (see warnLargeVideos). */
export async function warnAboutVideoUploads(reports: VideoUploadReport[]): Promise<void> {
  const unplayable = reports.filter((r) => !r.playable);
  if (unplayable.length > 0) await warnUnplayableVideo(unplayable);
  const large = reports.filter((r) => r.sizeBytes >= LARGE_VIDEO_BYTES);
  if (large.length > 0) await warnLargeVideos(large);
}
