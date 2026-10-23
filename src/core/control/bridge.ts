import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import packageJson from "../../../package.json";
import { useAssetStore } from "../assets/assetStore";
import { readSetting, writeSetting } from "../collab/settings";
import { plain } from "../document/plain";
import { useDocumentStore } from "../document/store";
import { useStartStore } from "../../features/start/startStore";
import { usePlayerStore } from "../player/playerStore";
import { applyJsonPatches } from "./jsonPatches";
import type { JsonPatch } from "./jsonPatches";

/**
 * What an AI assistant may do with the module that is open here (the local interface, see src-tauri/src/control.rs): nothing, only look, or
 * look and change. It is the person's choice in the settings; "edit" is the default (every change is one step of the undo history).
 */
export type ControlMode = "off" | "read" | "edit";

/**
 * Whether the settings show the section "KI-Assistenten" (the command line tool, and what an assistant may do with the open module). It is
 * hidden for now - the way to hand the tool out is not decided yet - and while it is, the person has no way to allow anything: the
 * interface is OFF unless `localStorage["weft.control.mode"]` is set to "read" or "edit" by hand (for trying it out).
 */
export const AI_SETTINGS_VISIBLE = false;

const MODE_KEY = "weft.control.mode";

export function readControlMode(): ControlMode {
  const value = readSetting(MODE_KEY, AI_SETTINGS_VISIBLE ? "edit" : "off");
  return value === "off" || value === "read" || value === "edit" ? value : "off";
}

export function writeControlMode(mode: ControlMode): void {
  writeSetting(MODE_KEY, mode);
}

function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** Whether a module is open in the editor (and not the start screen or a player on top of it). */
function editing(): boolean {
  return useStartStore.getState().phase === "editor" && usePlayerStore.getState().player === null;
}

function requireModule(): void {
  if (!editing()) throw new Error("In Weft ist gerade kein Lernmodul zum Bearbeiten geöffnet (die Startseite oder ein Player ist zu sehen).");
}

function requireMode(needed: "read" | "edit"): ControlMode {
  const mode = readControlMode();
  if (mode === "off") throw new Error("Die Schnittstelle für KI-Assistenten ist in den Einstellungen von Weft ausgeschaltet (Einstellungen > KI-Assistenten).");
  if (needed === "edit" && mode !== "edit") throw new Error("Die KI darf in den Einstellungen von Weft nur lesen, nicht ändern (Einstellungen > KI-Assistenten).");
  return mode;
}

/** What the app itself does for a request that is more than reading or changing the module that is open (set by the editor shell). */
interface ControlHost {
  /** Opens a module as a new one, not yet saved anywhere (asks the person first if what is open has unsaved changes). */
  openModule(bytes: Uint8Array): Promise<void>;
}

let host: ControlHost | null = null;

export function setControlHost(next: ControlHost | null): void {
  host = next;
}

interface ApplyParams {
  patches: JsonPatch[];
  assets?: { id: string; fileName: string; mimeType: string; base64: string }[];
  label?: string;
}

const handlers: Record<string, (params: any) => unknown | Promise<unknown>> = {
  status: () => {
    const { doc, filePath } = useDocumentStore.getState();
    const mode = readControlMode();
    // (While the interface is off, nothing of what is open is given away - not even its title.)
    const open = mode !== "off" && editing();
    return {
      app: "weft",
      version: packageJson.version,
      mode,
      editing: open,
      title: open ? doc.content.title : null,
      filePath: open ? filePath : null,
      moduleId: open ? doc.content.id : null,
      formatVersion: doc.formatVersion,
    };
  },

  // The module as it is now (plain JSON), and which files (pictures, videos, fonts) belong to it - their bytes come with `asset`.
  read: () => {
    requireMode("read");
    requireModule();
    const { doc } = useDocumentStore.getState();
    const content = plain(doc.content);
    const blobs = useAssetStore.getState().blobs;
    const ids = [...content.assets.map((a) => a.id), ...content.customFonts.map((f) => f.id), ...(content.coverAssetId ? [content.coverAssetId] : [])];
    return { formatVersion: doc.formatVersion, content, blobs: ids.filter((id) => blobs.has(id)).map((id) => ({ id, size: blobs.get(id)!.size })) };
  },

  asset: async (params: { id: string }) => {
    requireMode("read");
    requireModule();
    const blob = useAssetStore.getState().blobs.get(params.id);
    if (!blob) throw new Error(`Die Datei ${params.id} gibt es im offenen Modul nicht.`);
    return { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  },

  // A module made elsewhere (a file the tool wrote) shown in the app - as a new module of its own, to be saved where the person wants.
  open: async (params: { base64: string }) => {
    requireMode("edit");
    if (!host) throw new Error("Die Weft-App ist noch nicht so weit (sie startet gerade).");
    await host.openModule(base64ToBytes(params.base64));
    return { opened: true };
  },

  // The changes of one run of `weft edit` on a copy: new files first, then all the steps as one change (one step of the undo history).
  apply: (params: ApplyParams) => {
    requireMode("edit");
    requireModule();
    for (const asset of params.assets ?? []) {
      useAssetStore.getState().setAsset(asset.id, new Blob([base64ToBytes(asset.base64)], { type: asset.mimeType }));
    }
    let outcome = { applied: 0, skipped: 0 };
    useDocumentStore.getState().edit(params.label || "Änderung durch KI", (draft) => {
      outcome = applyJsonPatches(draft, params.patches);
    });
    return outcome;
  },
};

/** Listens for requests of the local interface (main window of the desktop app). Returns the function that stops it. */
export async function startControlBridge(): Promise<() => void> {
  return listen<{ id: number; method: string; params: unknown }>("weft://control-request", async (event) => {
    const { id, method, params } = event.payload;
    try {
      const handler = handlers[method];
      if (!handler) throw new Error(`Unbekannte Anfrage „${method}".`);
      await invoke("control_reply", { id, ok: true, payload: await handler(params ?? {}) });
    } catch (error) {
      await invoke("control_reply", { id, ok: false, payload: error instanceof Error ? error.message : String(error) });
    }
  });
}
