import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { useAssetStore } from "../../assets/assetStore";
import { currentHandle, useDocumentStore } from "../../document/store";
import { isTauri } from "../../io/fileIO";
import { CURRENT_FORMAT_VERSION } from "../../types";
import type { WeftModule } from "../../types";
import { Automerge } from "../automerge";
import { FolderSync, findModuleFolder, listFolderModules, moduleFolderName, readFolderModule } from "./folderSync";
import type { AssetStorage, FolderModule, FolderSyncStatus } from "./folderSync";
import { TauriSyncFs } from "./syncFs";
import type { SyncFs } from "./syncFs";

/**
 * The folder sync (folderSync.ts) as the app uses it: which shared folder a module is synced with is
 * remembered per module (in the app's own storage - a path is different on every computer, so it
 * is never part of a file), and picked up again whenever that module is opened.
 */
const CONFIG_KEY = "weft:folderSync";
const INSTALL_KEY = "weft:installId";

const EMPTY_STATUS: FolderSyncStatus = { lastSyncAt: null, peerFiles: 0, missingMedia: 0, error: null };

/** For the UI. */
export const useFolderSync = create<{ active: boolean; folder: string | null; dir: string | null; status: FolderSyncStatus }>(() => ({
  active: false,
  folder: null,
  dir: null,
  status: EMPTY_STATUS,
}));

function loadConfig(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
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
  const picked = await open({ directory: true, multiple: false, title: "Gemeinsamen Ordner wählen" });
  return typeof picked === "string" ? picked : null;
}

/** Stops syncing the open module with its folder; `forget` also takes the folder off the module, so
 * it isn't picked up again next time. */
export function stopFolderSync(forget = true): void {
  if (forget) saveConfig((currentHandle().doc() as WeftModule).id, null);
  if (!current) return;
  current.sync.stop();
  current = null;
  useFolderSync.setState({ active: false, folder: null, dir: null, status: EMPTY_STATUS });
}

/** Starts syncing the open module with the shared folder `root`. */
export async function startFolderSync(root: string): Promise<void> {
  stopFolderSync(false);
  const handle = currentHandle();
  const content = handle.doc() as WeftModule;
  const fs = makeFs(root);
  try {
    const dir = (await findModuleFolder(fs, content.id)) ?? moduleFolderName(content);
    const sync = new FolderSync({
      handle,
      fs,
      dir,
      assets: assetStorage,
      installId: installId(),
      onStatus: (status) => useFolderSync.setState((s) => ({ status: { ...s.status, ...status } })),
    });
    current = { sync, handle };
    saveConfig(content.id, root);
    useFolderSync.setState({ active: true, folder: root, dir, status: EMPTY_STATUS });
    await sync.start();
  } catch (error) {
    current?.sync.stop();
    current = null;
    useFolderSync.setState({
      active: false,
      folder: root,
      dir: null,
      status: { ...EMPTY_STATUS, error: `Der Ordner lässt sich nicht verwenden: ${error instanceof Error ? error.message : String(error)}` },
    });
  }
}

/** Called whenever the document being edited has been replaced: the folder sync belongs to one document,
 * so it ends with it - and starts again if the new one is a module that is synced with a folder. */
export async function syncFolderForCurrentDocument(): Promise<void> {
  if (current && current.handle === currentHandle()) return;
  stopFolderSync(false);
  if (!folderSyncAvailable()) return;
  const root = loadConfig()[(currentHandle().doc() as WeftModule).id];
  if (root) await startFolderSync(root);
}

/** The modules in a shared folder. */
export async function listModulesInFolder(root: string): Promise<FolderModule[]> {
  return listFolderModules(makeFs(root));
}

/** Opens a module from a shared folder (everybody's work merged), and goes on syncing it with that folder. */
export async function openModuleFromFolder(root: string, module: FolderModule): Promise<void> {
  const { history, documentId } = await readFolderModule(makeFs(root), module);
  const content = Automerge.load<WeftModule>(history) as WeftModule;
  useDocumentStore.getState().loadDocument({ formatVersion: CURRENT_FORMAT_VERSION, content, history, documentId }, null);
  await startFolderSync(root);
}
