import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { useAssetStore } from "../../assets/assetStore";
import { currentHandle } from "../../document/store";
import { isTauri } from "../../io/fileIO";
import { CURRENT_FORMAT_VERSION } from "../../types";
import type { WeftDocument, WeftModule } from "../../types";
import { Automerge } from "../automerge";
import { FolderSync, findModuleFolder, moduleFolderName, readFolderModule } from "./folderSync";
import type { AssetStorage, FolderLink, FolderModule, FolderSyncStatus } from "./folderSync";
import { TauriSyncFs } from "./syncFs";
import type { SyncFs } from "./syncFs";
import { tr } from "../../i18n/tr";

/**
 * The folder sync (folderSync.ts) as the app uses it: which shared folder a module is synced with is
 * remembered per module (in the app's own storage - a path is different on every computer, so it
 * is never part of a file), and picked up again whenever that module is opened.
 */
const CONFIG_KEY = "weft:folderSync";
const INSTALL_KEY = "weft:installId";

const EMPTY_STATUS: FolderSyncStatus = { lastSyncAt: null, peerFiles: 0, missingMedia: 0, error: null };

/** Why a module that is meant to be synced with a folder is not: the shared folder is not there (a drive that is not connected, or it was
 * moved or renamed), or it is, but the module's own directory in it is gone (moved, renamed, deleted). Nothing is touched then - least
 * of all is a new directory made in a place that is no longer where it was. */
export interface FolderLost {
  folder: string;
  reason: "folder" | "dir";
}

/** For the UI. */
export const useFolderSync = create<{ active: boolean; folder: string | null; dir: string | null; status: FolderSyncStatus; lost: FolderLost | null }>(() => ({
  active: false,
  folder: null,
  dir: null,
  status: EMPTY_STATUS,
  lost: null,
}));

function loadConfig(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Whether the module is synced with a shared folder on this computer (see the module comment: remembered per module id). */
export function isFolderSyncedModule(moduleId: string): boolean {
  return !!loadConfig()[moduleId];
}

function saveConfig(moduleId: string, folder: string | null): void {
  const config = loadConfig();
  if (folder) config[moduleId] = folder;
  else delete config[moduleId];
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* not remembered - the folder has to be chosen again next time */
  }
}

/** Tells this installation's file in a shared folder from everybody else's. */
function installId(): string {
  try {
    const stored = localStorage.getItem(INSTALL_KEY);
    if (stored) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const generated = [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
    localStorage.setItem(INSTALL_KEY, generated);
    return generated;
  } catch {
    return "x" + Math.random().toString(36).slice(2, 10);
  }
}

const assetStorage: AssetStorage = {
  has: (id) => useAssetStore.getState().blobs.has(id),
  get: (id) => useAssetStore.getState().blobs.get(id),
  set: (id, blob) => useAssetStore.getState().setAsset(id, blob),
};

let current: { sync: FolderSync; handle: unknown } | null = null;

let makeFs: (root: string) => SyncFs = (root) => new TauriSyncFs(root);
let fsReplaced = false;

/** Replaces the file system a shared folder is read through - for tests, which use one in memory. */
export function setSyncFsFactory(factory: (root: string) => SyncFs): void {
  makeFs = factory;
  fsReplaced = true;
}

/** Whether folders can be synced here at all: in the desktop app (or with a replaced file system). */
export function folderSyncAvailable(): boolean {
  return fsReplaced || isTauri();
}

/** Lets the person pick the shared folder. */
export async function chooseSyncFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, title: tr("ui.choose_shared_folder") });
  return typeof picked === "string" ? picked : null;
}

/** Stops syncing the open module with its folder; `forget` also takes the folder off the module, so
 * it isn't picked up again next time. */
export function stopFolderSync(forget = true): void {
  if (forget) saveConfig((currentHandle().doc() as WeftModule).id, null);
  if (!current) {
    if (forget) useFolderSync.setState({ active: false, folder: null, dir: null, status: EMPTY_STATUS, lost: null });
    return;
  }
  current.sync.stop();
  current = null;
  useFolderSync.setState({ active: false, folder: null, dir: null, status: EMPTY_STATUS, lost: null });
}

/**
 * Starts syncing the open module with the shared folder `root`. A folder the person has just chosen (`remembered` false) gets a directory for
 * the module if it has none yet. A folder the module was synced with before (`remembered` true: it is picked up again when the module is
 * opened) must still be there, with the module's directory in it - if it is not, nothing is synced and nothing is made, and `lost` says why
 * (see FolderLost).
 */
export async function startFolderSync(root: string, remembered = false): Promise<void> {
  stopFolderSync(false);
  const handle = currentHandle();
  const content = handle.doc() as WeftModule;
  const fs = makeFs(root);
  try {
    let dir = await findModuleFolder(fs, content.id);
    if (remembered && !dir) {
      const reason = (await fs.isDirectory([])) ? "dir" : "folder";
      useFolderSync.setState({ active: false, folder: root, dir: null, status: EMPTY_STATUS, lost: { folder: root, reason } });
      return;
    }
    dir ??= moduleFolderName(content);
    const sync = new FolderSync({
      handle,
      fs,
      dir,
      assets: assetStorage,
      installId: installId(),
      onStatus: (status) => useFolderSync.setState((s) => ({ status: { ...s.status, ...status } })),
      onLost: () => {
        // The directory went while the module was open: the same as finding it gone at the start.
        if (current?.sync === sync) current = null;
        useFolderSync.setState({ active: false, folder: root, dir: null, status: EMPTY_STATUS, lost: { folder: root, reason: "dir" } });
      },
    });
    current = { sync, handle };
    saveConfig(content.id, root);
    useFolderSync.setState({ active: true, folder: root, dir, status: EMPTY_STATUS, lost: null });
    await sync.start();
  } catch (error) {
    current?.sync.stop();
    current = null;
    useFolderSync.setState({
      active: false,
      folder: root,
      dir: null,
      lost: null,
      status: { ...EMPTY_STATUS, error: tr("ui.the_folder_cannot_be_used", { n0: error instanceof Error ? error.message : String(error) }) },
    });
  }
}

/** Called whenever the document being edited has been replaced: the folder sync belongs to one document,
 * so it ends with it - and starts again if the new one is a module that is synced with a folder. */
export async function syncFolderForCurrentDocument(): Promise<void> {
  if (current && current.handle === currentHandle()) return;
  stopFolderSync(false);
  // (Whatever was said about the module before is not about this one.)
  useFolderSync.setState({ active: false, folder: null, dir: null, status: EMPTY_STATUS, lost: null });
  if (!folderSyncAvailable()) return;
  const root = loadConfig()[(currentHandle().doc() as WeftModule).id];
  if (root) await startFolderSync(root, true);
}

/** Where a link file lies: the folder of the module it opens (its own directory) and the shared folder around that. */
function splitLinkPath(linkPath: string): { root: string; dir: string } {
  const parts = linkPath.split(/[\\/]/);
  const separator = linkPath.includes("\\") && !linkPath.includes("/") ? "\\" : "/";
  if (parts.length < 3) throw new Error(tr("ui.this_folder_does_not_hold_a"));
  const dir = parts[parts.length - 2];
  const root = parts.slice(0, -2).join(separator) || separator;
  return { root, dir };
}

/** The module a link file ("<title>.weft" in a module's directory of a shared folder, see FolderLink) stands for, and the shared folder it is in. */
export function moduleOfLink(link: FolderLink, linkPath: string): { root: string; module: FolderModule } {
  const { root, dir } = splitLinkPath(linkPath);
  return { root, module: { dir, moduleId: link.moduleId, documentId: link.documentId, title: link.title || dir, peerFiles: 0 } };
}

/** Makes the module `moduleId` one that is synced with the shared folder `root` whenever it is opened on this computer. */
export function rememberSyncFolder(moduleId: string, root: string): void {
  saveConfig(moduleId, root);
}

/** The module in a module's directory of a shared folder as everybody's work stands (nothing synced yet: that is startFolderSync). */
export async function readModuleFromFolder(root: string, module: FolderModule): Promise<WeftDocument> {
  const { history, documentId } = await readFolderModule(makeFs(root), module);
  const content = Automerge.load<WeftModule>(history) as WeftModule;
  return { formatVersion: CURRENT_FORMAT_VERSION, content, history, documentId };
}
