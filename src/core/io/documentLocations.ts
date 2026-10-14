import { exists, readFile, stat } from "@tauri-apps/plugin-fs";
import { unzipSync, strFromU8 } from "fflate";
import { isFolderSyncedModule } from "../collab/folder/folderSession";
import { createId } from "../id";
import { libraryMode } from "../platform";
import { readRecentFiles } from "./recentFiles";
import type { WeftDocument } from "../types";

/**
 * Where a module's file was last seen (module id -> path), kept in the app's own storage - a path is different on every computer, so
 * it never is part of a file. What it is for: a file that is copied in the file system (Finder, Explorer) is a second file with the
 * same module id. Opening such a copy would make the two one module as far as merging and collaboration go; mostly a copy is meant
 * to be a module of its own - so when a file is opened whose id has been seen at another place, where a file with that id still
 * is, the opened one is a copy and gets a new id (and a history of its own, like "Duplizieren"). If nothing is left at the old
 * place, the file was moved or renamed: only the remembered place changes.
 */
const KEY = "weft:documentLocations";

function readLocations(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeLocations(locations: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(locations));
  } catch {
    // not remembered - the next open starts again with what it finds
  }
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, "/") === b.replace(/\\/g, "/");
}

/** The volume a path is on (/Volumes/NAS, D:\, \\server\share, /mnt/x): whether it is there says whether a missing file is gone or just
 * out of reach (a disk that is not connected, a share that is not mounted). */
function volumeRoot(path: string): string {
  const mac = /^\/Volumes\/[^/]+/.exec(path);
  if (mac) return mac[0];
  const drive = /^[A-Za-z]:[\\/]/.exec(path);
  if (drive) return drive[0];
  const unc = /^\\\\[^\\]+\\[^\\]+/.exec(path);
  if (unc) return unc[0];
  const mount = /^\/(?:mnt|media|run\/media\/[^/]+)\/[^/]+/.exec(path);
  if (mount) return mount[0];
  return "/";
}

/** What there is at the place a module was last seen. */
type Probe =
  /** a file of this module (same id) is there: `identity` is what tells it from the very file that is being opened */
  | { kind: "same"; identity: string | null }
  /** a file is there, but of another module (or no module file at all) */
  | { kind: "other" }
  /** nothing there, though the place is reachable */
  | { kind: "missing" }
  /** can't tell: the volume is not there, or not allowed to be read */
  | { kind: "unreachable" };

async function fileIdentity(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    const { dev, ino } = info as { dev?: number | null; ino?: number | null };
    return ino ? `${dev ?? 0}:${ino}` : null;
  } catch {
    return null;
  }
}

async function probe(path: string, moduleId: string): Promise<Probe> {
  try {
    const bytes = await readFile(path);
    // Only weft.json is unpacked (the media of a module can be large).
    const files = unzipSync(bytes, { filter: (file) => file.name === "weft.json" });
    const json = files["weft.json"];
    if (!json) return { kind: "other" };
    const id = (JSON.parse(strFromU8(json)) as { content?: { id?: unknown } }).content?.id;
    return id === moduleId ? { kind: "same", identity: await fileIdentity(path) } : { kind: "other" };
  } catch {
    // Not readable: gone, or out of reach. (The file is read first, not looked for: the app may only look at a few places - the
    // volume's root "/" is not one of them, so asking whether it exists would fail for every file.)
  }
  try {
    const root = volumeRoot(path);
    if (root !== "/" && !(await exists(root))) return { kind: "unreachable" };
    return (await exists(path)) ? { kind: "unreachable" } : { kind: "missing" };
  } catch {
    return { kind: "unreachable" };
  }
}

/**
 * A file that was copied before Weft had ever seen its original has no remembered place to compare with. What Weft does know are the
 * files it opened or saved last (the recent files): the id of module `moduleId` is looked for among them, and a file found there (not
 * the one being opened, and not the very same file) is the original. The id of every recent file read is remembered (by size and
 * time of change), so that each is read once - the files can be large.
 */
const RECENT_IDS_KEY = "weft:recentFileIds";
const MAX_RECENT_BYTES = 300 * 1024 * 1024;

async function findOriginalInRecents(moduleId: string, path: string): Promise<string | null> {
  let cache: Record<string, { key: string; id: string }> = {};
  try {
    cache = JSON.parse(localStorage.getItem(RECENT_IDS_KEY) ?? "{}") as typeof cache;
  } catch {
    cache = {};
  }
  const here = await fileIdentity(path);
  let found: string | null = null;
  let changed = false;
  for (const candidate of readRecentFiles()) {
    if (samePath(candidate, path)) continue;
    try {
      const info = await stat(candidate);
      if (!info.isFile || info.size > MAX_RECENT_BYTES) continue;
      const key = `${info.size}:${info.mtime ? info.mtime.getTime() : 0}`;
      let id = cache[candidate]?.key === key ? cache[candidate].id : null;
      if (id === null) {
        const files = unzipSync(await readFile(candidate), { filter: (file) => file.name === "weft.json" });
        const json = files["weft.json"];
        const parsed = json ? (JSON.parse(strFromU8(json)) as { content?: { id?: unknown } }).content?.id : null;
        id = typeof parsed === "string" ? parsed : "";
        cache[candidate] = { key, id };
        changed = true;
      }
      if (id === moduleId) {
        const identity = await fileIdentity(candidate);
        // (The very same file by another route is not an original.)
        if (here !== null && identity !== null && here === identity) continue;
        found = candidate;
        break;
      }
    } catch {
      // a file that is gone or cannot be read is no original
    }
  }
  if (changed) {
    try {
      localStorage.setItem(RECENT_IDS_KEY, JSON.stringify(cache));
    } catch {
      // read again next time
    }
  }
  return found;
}

export interface ReconciledDocument {
  doc: WeftDocument;
  /** Set when the opened file was found to be a copy and got a new id: the name of the file it is a copy of. */
  copyOf: string | null;
}

/**
 * Called with a document just read from `path` (before it is loaded): decides whether it is a copy of a file somewhere else and, if
 * so, returns it with a new id and no editing history of the original (as "Duplizieren" makes one). Never touches the file - the new id
 * is saved with the next save (the editor marks the document as changed, so that the autosave writes it).
 *
 * Left alone: a file that is part of a collaboration (a live invitation, or a module synced with a shared folder) - for those, copies
 * with the same id are the point - a file seen at this very place, and one whose earlier place can't be told about (a disk that is not
 * connected).
 */
export async function reconcileOpenedDocument(doc: WeftDocument, path: string | null): Promise<ReconciledDocument> {
  if (!path || libraryMode() || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return { doc, copyOf: null };
  const id = doc.content.id;
  const locations = readLocations();
  let known: string | undefined = locations[id];
  // Never seen: perhaps copied before Weft knew the original - look among the files opened last.
  if (!known && !doc.live && !isFolderSyncedModule(id)) known = (await findOriginalInRecents(id, path)) ?? undefined;

  if (!known || samePath(known, path)) {
    locations[id] = path;
    writeLocations(locations);
    return { doc, copyOf: null };
  }
  // Seen at another place. Not a copy if the file belongs to a collaboration: the copies are meant to be one module.
  if (doc.live || isFolderSyncedModule(id)) return { doc, copyOf: null };

  const earlier = await probe(known, id);
  if (earlier.kind === "same") {
    // The very same file reached by another route (a link, another spelling of the path) is no copy.
    const here = await fileIdentity(path);
    if (here !== null && earlier.identity !== null && here === earlier.identity) {
      locations[id] = path;
      writeLocations(locations);
      return { doc, copyOf: null };
    }
    // A copy: a module of its own from now on.
    const newId = createId();
    if (!locations[id]) locations[id] = known;
    locations[newId] = path;
    writeLocations(locations);
    const { history: _history, documentId: _documentId, live: _live, ...rest } = doc;
    void _history;
    void _documentId;
    void _live;
    return { doc: { ...rest, content: { ...doc.content, id: newId } }, copyOf: fileName(known) };
  }
  if (earlier.kind === "unreachable") return { doc, copyOf: null };
  // Gone from there (or another module's file lies there now): the file was moved or renamed.
  locations[id] = path;
  writeLocations(locations);
  return { doc, copyOf: null };
}

/**
 * A file was saved under a new name/place ("Speichern unter"): remembered as the place of the module - unless the file at the earlier
 * place is still there, then that one stays the module's place (the one just saved is a copy, and will be told so when it is opened).
 */
export async function rememberSavedLocation(moduleId: string, path: string): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window) || libraryMode()) return;
  const locations = readLocations();
  const known = locations[moduleId];
  if (known && !samePath(known, path)) {
    const earlier = await probe(known, moduleId);
    if (earlier.kind === "same" || earlier.kind === "unreachable") return;
  }
  locations[moduleId] = path;
  writeLocations(locations);
}
