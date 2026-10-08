import { documentDir } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readFile, remove, rename, stat, writeFile } from "@tauri-apps/plugin-fs";
import { libraryDemo, libraryMode } from "../platform";

/**
 * The library: where Weft keeps the modules on a tablet (see libraryMode). An app there can't write back to a file it was
 * handed - the file dialog gives it a copy - nor save to a place of its own choosing, so every module lives in the app's
 * Documents folder from the moment it exists, and is saved there continuously (autosave.ts, as it saves any file with a
 * path). The folder shows up in the Files app ("Auf meinem iPad > Weft": UIFileSharingEnabled in Info.plist), where
 * modules can be copied out and in. Going out of the app otherwise is sharing a copy (writeExport, then the share sheet);
 * coming in is importing a copy (importIntoLibrary).
 *
 * Paths are stored for the next launch relative to the Documents folder (toStoredPath): the system may move the app's
 * folders around (an update, a restore) and an absolute path from before would then lead nowhere.
 */

/** The disk, as far as the library needs it - the real one (Tauri) or an in-memory one (the demo in a browser, tests). */
export interface LibraryFs {
  documentsDir(): Promise<string>;
  readDir(dir: string): Promise<{ name: string; isFile: boolean }[]>;
  stat(path: string): Promise<{ size: number; modified: number }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

class TauriLibraryFs implements LibraryFs {
  async documentsDir() {
    return (await documentDir()).replace(/\/+$/, "");
  }
  async readDir(dir: string) {
    return (await readDir(dir)).map((entry) => ({ name: entry.name, isFile: entry.isFile }));
  }
  async stat(path: string) {
    const info = await stat(path);
    return { size: info.size, modified: info.mtime ? info.mtime.getTime() : 0 };
  }
  exists(path: string) {
    return exists(path);
  }
  mkdir(path: string) {
    return mkdir(path, { recursive: true });
  }
  readFile(path: string) {
    return readFile(path);
  }
  writeFile(path: string, bytes: Uint8Array) {
    return writeFile(path, bytes);
  }
  remove(path: string) {
    return remove(path);
  }
  rename(from: string, to: string) {
    return rename(from, to);
  }
}

/** A disk in memory: the library in a browser (see libraryDemo), and for tests. */
export class MemoryLibraryFs implements LibraryFs {
  private files = new Map<string, { bytes: Uint8Array; modified: number }>();
  private dirs = new Set<string>(["/Documents"]);
  async documentsDir() {
    return "/Documents";
  }
  async readDir(dir: string) {
    const prefix = `${dir}/`;
    const entries = new Map<string, boolean>();
    for (const path of this.files.keys()) if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) entries.set(rest, true);
      else entries.set(rest.slice(0, slash), entries.get(rest.slice(0, slash)) ?? false);
    }
    for (const path of this.dirs) if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/")) entries.set(path.slice(prefix.length), false);
    return [...entries].map(([name, isFile]) => ({ name, isFile }));
  }
  async stat(path: string) {
    const file = this.files.get(path);
    if (!file) throw new Error(`no such file: ${path}`);
    return { size: file.bytes.length, modified: file.modified };
  }
  async exists(path: string) {
    return this.files.has(path) || this.dirs.has(path);
  }
  async mkdir(path: string) {
    this.dirs.add(path);
  }
  async readFile(path: string) {
    const file = this.files.get(path);
    if (!file) throw new Error(`no such file: ${path}`);
    return file.bytes.slice();
  }
  async writeFile(path: string, bytes: Uint8Array) {
    this.files.set(path, { bytes: bytes.slice(), modified: Date.now() });
  }
  async remove(path: string) {
    if (!this.files.delete(path)) throw new Error(`no such file: ${path}`);
  }
  async rename(from: string, to: string) {
    const file = this.files.get(from);
    if (!file) throw new Error(`no such file: ${from}`);
    if (this.files.has(to)) throw new Error(`already exists: ${to}`);
    this.files.delete(from);
    this.files.set(to, file);
  }
}

let fs: LibraryFs | null = null;
function disk(): LibraryFs {
  fs ??= libraryDemo() ? new MemoryLibraryFs() : new TauriLibraryFs();
  return fs;
}

/** Only for tests: the disk to use. */
export function setLibraryFs(next: LibraryFs | null): void {
  fs = next;
  documents = null;
}

const EXPORTS_FOLDER = "Exporte";
const STORED_PREFIX = "documents:";
let documents: string | null = null;

/** Finds the Documents folder and makes the folder for exports - call once, before anything else here (and before the
 * paths that are stored are read: see fromStoredPath). Does nothing where there is no library. */
export async function initLibrary(): Promise<void> {
  if (!libraryMode()) return;
  documents = await disk().documentsDir();
  await disk().mkdir(`${documents}/${EXPORTS_FOLDER}`);
}

function documentsFolder(): string {
  if (documents === null) throw new Error("Die Bibliothek ist nicht bereit.");
  return documents;
}

/** `path` as it is kept between launches: relative to the Documents folder, if it is in it. */
export function toStoredPath(path: string): string {
  return documents !== null && path.startsWith(`${documents}/`) ? STORED_PREFIX + path.slice(documents.length + 1) : path;
}

/** The path of a stored one, in the Documents folder of this launch. */
export function fromStoredPath(stored: string): string {
  return documents !== null && stored.startsWith(STORED_PREFIX) ? `${documents}/${stored.slice(STORED_PREFIX.length)}` : stored;
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const MODULE_EXTENSION = ".weft";

/** A name that is safe as a file name, from whatever the module is called. */
export function safeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || "Lernmodul";
}

/** `base` + `extension` in `dir`, or - if there is such a file already - `base 2`, `base 3`, ... */
async function uniquePath(dir: string, base: string, extension: string, except?: string): Promise<string> {
  for (let n = 1; ; n++) {
    const path = `${dir}/${n === 1 ? base : `${base} ${n}`}${extension}`;
    if (path === except || !(await disk().exists(path))) return path;
  }
}

/** Writes next to the target and renames over it: a crash halfway leaves no truncated file. */
async function writeSafely(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.tmp`;
  await disk().writeFile(temporary, bytes);
  try {
    await disk().rename(temporary, path);
  } catch {
    await disk().writeFile(path, bytes);
    await disk().remove(temporary).catch(() => undefined);
  }
}

export interface LibraryEntry {
  name: string;
  path: string;
  /** Last change, in ms since 1970. */
  modified: number;
  size: number;
}

/** The modules in the library, the most recently changed first. */
export async function listLibrary(): Promise<LibraryEntry[]> {
  const dir = documentsFolder();
  const entries: LibraryEntry[] = [];
  for (const entry of await disk().readDir(dir)) {
    if (!entry.isFile || entry.name.startsWith(".") || !entry.name.toLowerCase().endsWith(MODULE_EXTENSION)) continue;
    const path = `${dir}/${entry.name}`;
    try {
      const info = await disk().stat(path);
      entries.push({ name: entry.name.slice(0, -MODULE_EXTENSION.length), path, modified: info.modified, size: info.size });
    } catch {
      // gone in the meantime
    }
  }
  return entries.sort((a, b) => b.modified - a.modified);
}

/** A new file in the library, named after the module; returns its path. */
export async function createLibraryFile(title: string, bytes: Uint8Array): Promise<string> {
  const path = await uniquePath(documentsFolder(), safeFileName(title), MODULE_EXTENSION);
  await writeSafely(path, bytes);
  return path;
}

/** A module that came from outside (a file picked in the Files app, an export of somebody else): a copy in the library.
 * `originalName` is what the file was called (".weft", ".weft.zip" are dropped from it). */
export async function importIntoLibrary(bytes: Uint8Array, originalName: string): Promise<string> {
  const base = originalName.replace(/\.zip$/i, "").replace(/\.weft$/i, "");
  return createLibraryFile(base, bytes);
}

/** Gives a file of the library another name; returns the new path. */
export async function renameLibraryFile(path: string, newName: string): Promise<string> {
  const dir = documentsFolder();
  const target = await uniquePath(dir, safeFileName(newName), MODULE_EXTENSION, path);
  if (target !== path) await disk().rename(path, target);
  return target;
}

export async function deleteLibraryFile(path: string): Promise<void> {
  await disk().remove(path);
}

export function readLibraryFile(path: string): Promise<Uint8Array> {
  return disk().readFile(path);
}

/** A file made for handing on (an export, a copy of the module): kept in the library's folder for exports, which is in the Files
 * app like the rest - so it is there even if sharing it is cancelled. Returns its path. */
export async function writeExport(fileName: string, bytes: Uint8Array): Promise<string> {
  const dir = `${documentsFolder()}/${EXPORTS_FOLDER}`;
  await disk().mkdir(dir);
  const extension = /\.weft\.zip$/i.test(fileName) ? ".weft.zip" : /\.[^./]+$/.exec(fileName)?.[0] ?? "";
  const path = await uniquePath(dir, safeFileName(fileName.slice(0, fileName.length - extension.length)), extension);
  await writeSafely(path, bytes);
  return path;
}

/** Saves a file that is in the library already (autosave and "Speichern" do that). */
export function writeLibraryFile(path: string, bytes: Uint8Array): Promise<void> {
  return writeSafely(path, bytes);
}

/** Whether `path` is a file of the library itself (not an export, not somewhere else). */
export function isLibraryPath(path: string): boolean {
  return documents !== null && path.startsWith(`${documents}/`) && !path.slice(documents.length + 1).includes("/");
}
