import type { DocHandle } from "@automerge/automerge-repo";
import { Automerge } from "../automerge";
import { mergeHistoryInto } from "../merge";
import { sharesOrigin } from "../origin";
import { usedAssetIds } from "../../document/usedAssets";
import type { WeftModule } from "../../types";
import { TEMP_SUFFIX } from "./syncFs";
import type { SyncFs } from "./syncFs";

/**
 * Working on a module together through a shared folder - one that a file-sync service (Nextcloud,
 * Sciebo, Dropbox, Syncthing) already keeps the same for everybody. No server of ours, and nobody has
 * to be online at the same time as anybody else.
 *
 * In that folder every module has a directory of its own, and in it:
 *
 *   weft-folder.json        which module (and Automerge document) this is, and its title
 *   peer-<install>.automerge  the editing history of one person's copy - written ONLY by that person
 *   assets/<id>_<name>        the module's images, videos and fonts, one file each, written once
 *
 * Each person writes just their own file, so the file-sync service never sees two people change one
 * file (which it would answer with "conflicted copy" files). Everybody reads the others' files: a
 * file's history is merged into the open module (mergeHistoryInto) - merging is what Automerge does
 * without conflicts, in any order, any number of times. Our own file always holds everything we know,
 * the others' changes included, so it also carries changes on to people who are only connected to us
 * through the folder at different times.
 *
 * The folder is looked at every few seconds and our file is written a moment after something changed;
 * a file that is still arriving (a sync client delivers it in pieces) can't be read yet and is simply
 * tried again next time.
 */
export const META_FILE = "weft-folder.json";
const PEER_FILE = /^peer-([A-Za-z0-9_-]+)\.automerge$/;
const ASSETS_DIR = "assets";

/** Where the images, videos and fonts of the open module are kept - the app's asset store. */
export interface AssetStorage {
  has(id: string): boolean;
  get(id: string): Blob | undefined;
  set(id: string, blob: Blob): void;
}

export interface FolderSyncStatus {
  /** When the folder was last looked at (ms). */
  lastSyncAt: number | null;
  /** How many other people's files are in the folder. */
  peerFiles: number;
  /** Images, videos and fonts the module uses that have not arrived yet. */
  missingMedia: number;
  /** What is wrong, if something is. */
  error: string | null;
}

export interface FolderSyncOptions {
  handle: DocHandle<WeftModule>;
  fs: SyncFs;
  /** The module's directory in the shared folder (see moduleFolderName). */
  dir: string;
  assets: AssetStorage;
  /** Tells this copy from every other person's (and every other computer's) - names our file. */
  installId: string;
  pollMs?: number;
  writeDebounceMs?: number;
  onStatus?: (status: Partial<FolderSyncStatus>) => void;
}

interface FolderMeta {
  moduleId: string;
  documentId: string;
  title: string;
}

/** The name of a module's directory: readable in the file browser, and carrying the start of the module
 * id by which it is found again (whoever made the directory first, and under whichever title). */
export function moduleFolderName(content: Pick<WeftModule, "id" | "title">): string {
  const slug = content.title
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "lernmodul"}-${content.id.slice(0, 8)}`;
}

/** The directory in the shared folder that belongs to module `moduleId`, if there is one. */
export async function findModuleFolder(fs: SyncFs, moduleId: string): Promise<string | null> {
  const suffix = `-${moduleId.slice(0, 8)}`;
  const entry = (await fs.list([])).find((e) => e.isDirectory && e.name.endsWith(suffix));
  return entry?.name ?? null;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

function fingerprint(info: { size: number; mtime: number }): string {
  return `${info.size}:${info.mtime}`;
}

export class FolderSync {
  private readonly ownFile: string;
  private readonly pollMs: number;
  private readonly debounceMs: number;
  /** What we have already read of each other file ("size:mtime"), so unchanged ones aren't read again. */
  private readonly seen = new Map<string, string>();
  private readonly uploaded = new Set<string>();
  /** Files that can't be merged, and why - kept for as long as the file is there and unchanged. */
  private readonly problemFiles = new Map<string, string>();
  private writtenHeads: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  private stopped = false;

  constructor(private readonly o: FolderSyncOptions) {
    this.ownFile = `peer-${o.installId}.automerge`;
    this.pollMs = o.pollMs ?? 5000;
    this.debounceMs = o.writeDebounceMs ?? 2500;
  }

  /** Sets up the module's directory (if it isn't there yet) and starts syncing. */
  async start(): Promise<void> {
    const { fs, dir, handle } = this.o;
    await fs.ensureDir([dir, ASSETS_DIR]);
    if (!(await fs.stat([dir, META_FILE]))) {
      const content = handle.doc() as WeftModule;
      const meta: FolderMeta = { moduleId: content.id, documentId: handle.documentId, title: content.title };
      await fs.write([dir, META_FILE], new TextEncoder().encode(JSON.stringify(meta, null, 2)));
    }
    handle.on("change", this.onChange);
    this.timer = setInterval(() => void this.syncNow(), this.pollMs);
    await this.syncNow();
  }

  stop(): void {
    this.stopped = true;
    this.o.handle.off("change", this.onChange);
    if (this.timer) clearInterval(this.timer);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.timer = this.writeTimer = null;
  }

  private onChange = (): void => {
    if (this.writeTimer || this.stopped) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.syncNow();
    }, this.debounceMs);
  };

  /** One round: read what the others have written, then write what we have. Rounds never overlap - one
   * asked for while another is running follows right after it. */
  async syncNow(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const problems = await this.pull();
        await this.push();
        const missing = this.missingAssetIds().length;
        this.o.onStatus?.({ lastSyncAt: Date.now(), missingMedia: missing, error: problems.length > 0 ? problems.join(" ") : null });
      } while (this.again && !this.stopped);
    } catch (error) {
      this.o.onStatus?.({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.running = false;
    }
  }

  private async pull(): Promise<string[]> {
    const { fs, dir, handle } = this.o;
    const entries = await fs.list([dir]);
    const peerFiles = entries.filter((e) => !e.isDirectory && PEER_FILE.test(e.name) && e.name !== this.ownFile);
    for (const name of [...this.problemFiles.keys()]) {
      if (!peerFiles.some((f) => f.name === name)) this.problemFiles.delete(name);
    }
    for (const file of peerFiles) {
      const before = await fs.stat([dir, file.name]);
      if (!before || this.seen.get(file.name) === fingerprint(before)) continue;
      let bytes: Uint8Array;
      try {
        bytes = await fs.read([dir, file.name]);
      } catch {
        continue;
      }
      // Still changing while we read it: a file-sync client is in the middle of delivering it.
      const after = await fs.stat([dir, file.name]);
      if (!after || fingerprint(after) !== fingerprint(before)) continue;
      const result = mergeHistoryInto(handle, bytes);
      if (result.ok) {
        this.seen.set(file.name, fingerprint(before));
        this.problemFiles.delete(file.name);
      } else if (result.reason !== "unreadable") {
        // Readable but not ours to merge - a different module, or a copy that doesn't go back to the same
        // file. Won't get better by reading it again.
        this.seen.set(file.name, fingerprint(before));
        this.problemFiles.set(
          file.name,
          result.reason === "other-module"
            ? `${file.name} gehört zu einem anderen Lernmodul.`
            : `${file.name} geht nicht auf dieselbe Ausgangsdatei zurück und lässt sich nicht zusammenführen.`,
        );
      }
      // "unreadable": probably incomplete - tried again next round.
    }
    await this.pullAssets();
    this.o.onStatus?.({ peerFiles: peerFiles.length });
    return [...this.problemFiles.values()];
  }

  /** Every file the module uses: images and videos still referenced, and the custom fonts. */
  private neededAssets(): { id: string; fileName: string; mimeType: string }[] {
    const content = this.o.handle.doc() as WeftModule;
    const used = usedAssetIds(content);
    return [
      ...content.assets.filter((a) => used.has(a.id)),
      ...content.customFonts.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType })),
    ];
  }

  private missingAssetIds(): string[] {
    return this.neededAssets()
      .filter((a) => !this.o.assets.has(a.id))
      .map((a) => a.id);
  }

  private async pullAssets(): Promise<void> {
    const missing = this.neededAssets().filter((a) => !this.o.assets.has(a.id));
    if (missing.length === 0) return;
    const { fs, dir, assets } = this.o;
    const names = (await fs.list([dir, ASSETS_DIR])).map((e) => e.name);
    for (const asset of missing) {
      const name = names.find((n) => n.startsWith(`${asset.id}_`) && !n.endsWith(TEMP_SUFFIX));
      if (!name) continue;
      try {
        assets.set(asset.id, new Blob([await fs.read([dir, ASSETS_DIR, name]) as BlobPart], { type: asset.mimeType }));
      } catch {
        // not readable yet - next round
      }
    }
  }

  private async push(): Promise<void> {
    const { fs, dir, handle, assets } = this.o;
    const doc = handle.doc() as WeftModule;
    const heads = Automerge.getHeads(doc as Automerge.Doc<WeftModule>).join();
    if (heads !== this.writtenHeads) {
      await fs.write([dir, this.ownFile], Automerge.save(doc as Automerge.Doc<WeftModule>));
      this.writtenHeads = heads;
    }
    const present = new Set((await fs.list([dir, ASSETS_DIR])).map((e) => e.name));
    for (const asset of this.neededAssets()) {
      const blob = assets.get(asset.id);
      if (!blob) continue;
      const name = `${asset.id}_${safeFileName(asset.fileName)}`;
      if (present.has(name) || this.uploaded.has(name)) continue;
      await fs.write([dir, ASSETS_DIR, name], new Uint8Array(await blob.arrayBuffer()));
      this.uploaded.add(name);
    }
  }
}

export interface FolderModule {
  /** The module's directory in the shared folder. */
  dir: string;
  moduleId: string;
  documentId: string;
  title: string;
  /** How many people's files are in it. */
  peerFiles: number;
}

/** The modules that live in a shared folder. */
export async function listFolderModules(fs: SyncFs): Promise<FolderModule[]> {
  const modules: FolderModule[] = [];
  for (const entry of await fs.list([])) {
    if (!entry.isDirectory) continue;
    try {
      const meta = JSON.parse(new TextDecoder().decode(await fs.read([entry.name, META_FILE]))) as FolderMeta;
      const peerFiles = (await fs.list([entry.name])).filter((e) => PEER_FILE.test(e.name)).length;
      if (meta.moduleId && meta.documentId) modules.push({ dir: entry.name, moduleId: meta.moduleId, documentId: meta.documentId, title: meta.title ?? entry.name, peerFiles });
    } catch {
      // not a module directory
    }
  }
  return modules;
}

/** The module in a directory of the shared folder as everybody's work stands: the histories of all the
 * files in it merged into one (any that don't go back to the same beginning are left out). */
export async function readFolderModule(fs: SyncFs, module: FolderModule): Promise<{ history: Uint8Array; documentId: string }> {
  const docs: Automerge.Doc<WeftModule>[] = [];
  for (const entry of await fs.list([module.dir])) {
    if (!PEER_FILE.test(entry.name)) continue;
    try {
      docs.push(Automerge.load<WeftModule>(await fs.read([module.dir, entry.name])));
    } catch {
      // incomplete or damaged - the others still make a module
    }
  }
  const [first, ...rest] = docs;
  if (!first) throw new Error("In diesem Ordner liegt noch kein Stand des Lernmoduls (oder er wird gerade erst synchronisiert).");
  let merged = first;
  for (const other of rest) {
    if (other.id === merged.id && sharesOrigin(other, merged)) merged = Automerge.merge(Automerge.clone(merged), other);
  }
  return { history: Automerge.save(merged), documentId: module.documentId };
}
