import { exists, mkdir, readDir, readFile, remove, rename, stat, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

/**
 * What the folder sync (folderSync.ts) needs of a file system: a shared folder, addressed by paths
 * relative to it (as lists of segments - no separators to get wrong), read and written as whole files.
 * The desktop app implements it on the real file system (TauriSyncFs); tests on memory (MemorySyncFs).
 */
export interface SyncFs {
  /** The entries of a directory (empty if it doesn't exist). */
  list(dir: string[]): Promise<{ name: string; isDirectory: boolean }[]>;
  /** Size and modification time (ms) of a file, or null if there is none. */
  stat(path: string[]): Promise<{ size: number; mtime: number } | null>;
  read(path: string[]): Promise<Uint8Array>;
  /** Writes a file so that nobody reading the folder ever sees half of it. */
  write(path: string[], data: Uint8Array): Promise<void>;
  ensureDir(dir: string[]): Promise<void>;
}

/** The suffix a file has while it is being written (and is ignored by everything that reads). */
export const TEMP_SUFFIX = ".tmp";

export class TauriSyncFs implements SyncFs {
  constructor(private readonly root: string) {}

  private path(segments: string[]): Promise<string> {
    return join(this.root, ...segments);
  }

  async list(dir: string[]): Promise<{ name: string; isDirectory: boolean }[]> {
    const path = await this.path(dir);
    if (!(await exists(path))) return [];
    return (await readDir(path)).map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
  }

  async stat(path: string[]): Promise<{ size: number; mtime: number } | null> {
    const full = await this.path(path);
    if (!(await exists(full))) return null;
    const info = await stat(full);
    return { size: info.size, mtime: info.mtime?.getTime() ?? 0 };
  }

  async read(path: string[]): Promise<Uint8Array> {
    return readFile(await this.path(path));
  }

  async write(path: string[], data: Uint8Array): Promise<void> {
    // Written next to its destination and moved into place: a file-sync client (Nextcloud, Syncthing)
    // that picks the file up mid-write would otherwise hand the other side half a file.
    const full = await this.path(path);
    const temporary = full + TEMP_SUFFIX;
    await writeFile(temporary, data);
    try {
      await rename(temporary, full);
    } catch (error) {
      await remove(temporary).catch(() => undefined);
      throw error;
    }
  }

  async ensureDir(dir: string[]): Promise<void> {
    const path = await this.path(dir);
    if (!(await exists(path))) await mkdir(path, { recursive: true });
  }
}

/** A file system in memory - for tests. `now` is the clock for modification times. */
export class MemorySyncFs implements SyncFs {
  readonly files = new Map<string, { data: Uint8Array; mtime: number }>();
  private readonly dirs = new Set<string>([""]);
  now = () => Date.now();
  /** Calls to write(), by path - to see how often something got written. */
  readonly writes: string[] = [];

  private key(path: string[]): string {
    return path.join("/");
  }

  async list(dir: string[]): Promise<{ name: string; isDirectory: boolean }[]> {
    const prefix = dir.length ? this.key(dir) + "/" : "";
    const found = new Map<string, boolean>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length).split("/");
      found.set(rest[0], rest.length > 1 || found.get(rest[0]) === true);
    }
    for (const d of this.dirs) {
      if (d && d.startsWith(prefix) && d !== prefix.slice(0, -1)) {
        const name = d.slice(prefix.length).split("/")[0];
        if (!found.has(name)) found.set(name, true);
      }
    }
    return [...found].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  async stat(path: string[]): Promise<{ size: number; mtime: number } | null> {
    const file = this.files.get(this.key(path));
    return file ? { size: file.data.length, mtime: file.mtime } : null;
  }

  async read(path: string[]): Promise<Uint8Array> {
    const file = this.files.get(this.key(path));
    if (!file) throw new Error(`Datei fehlt: ${this.key(path)}`);
    return file.data.slice();
  }

  async write(path: string[], data: Uint8Array): Promise<void> {
    this.writes.push(this.key(path));
    this.files.set(this.key(path), { data: data.slice(), mtime: this.now() });
  }

  async ensureDir(dir: string[]): Promise<void> {
    for (let i = 1; i <= dir.length; i++) this.dirs.add(dir.slice(0, i).join("/"));
  }
}
