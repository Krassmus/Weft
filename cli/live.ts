import { connect } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import type { Zippable } from "fflate";
import { diffJson } from "../src/core/control/jsonPatches";
import type { WeftModule } from "../src/core/types";
import { CliError } from "./load";

/**
 * The module that is open in the Weft app, live: the tool asks the running app (a socket on this computer, see src-tauri/src/control.rs)
 * instead of reading a file. For reading, the app hands over the module as it is now and the tool puts it into a temporary file - so
 * that every command that reads a file (inspect, validate, render, play ...) works on it unchanged. For changing, the tool runs its
 * operations on that copy (the same code as for a file) and sends back what changed, as small steps: the app applies them as ONE step of
 * its undo history, on top of whatever the person has done meanwhile.
 */

/** Where the app says how to reach it: the port and a password (control.json in the app's data folder). */
export function controlFile(): string {
  if (process.env.WEFT_CONTROL_FILE) return process.env.WEFT_CONTROL_FILE;
  const identifier = "com.weft.app";
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", identifier, "control.json");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), identifier, "control.json");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), identifier, "control.json");
}

const NOT_RUNNING =
  "Die Weft-App läuft nicht (oder ist zu alt für diese Schnittstelle). Öffne Weft und ein Lernmodul darin - oder gib eine Datei an.";

interface ControlInfo {
  port: number;
  token: string;
}

function readControlInfo(): ControlInfo {
  const file = controlFile();
  if (!existsSync(file)) throw new CliError(NOT_RUNNING);
  try {
    const info = JSON.parse(readFileSync(file, "utf8")) as ControlInfo;
    if (typeof info.port !== "number" || typeof info.token !== "string") throw new Error("shape");
    return info;
  } catch {
    throw new CliError(NOT_RUNNING);
  }
}

/** One request to the running app and its answer. */
export function liveCall<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const info = readControlInfo();
  return new Promise<T>((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port: info.port });
    let buffer = "";
    let done = false;
    const finish = (action: () => void) => {
      if (done) return;
      done = true;
      socket.destroy();
      action();
    };
    socket.setEncoding("utf8");
    socket.setTimeout(150_000, () => finish(() => reject(new CliError("Die Weft-App antwortet nicht."))));
    socket.on("connect", () => socket.write(JSON.stringify({ id: 1, token: info.token, method, params }) + "\n"));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      finish(() => {
        try {
          const answer = JSON.parse(buffer.slice(0, end)) as { ok: boolean; result?: T; error?: string };
          if (answer.ok) resolve(answer.result as T);
          else reject(new CliError(String(answer.error ?? "Die Weft-App hat die Anfrage abgelehnt.")));
        } catch {
          reject(new CliError("Die Antwort der Weft-App ist nicht lesbar."));
        }
      });
    });
    socket.on("error", () => finish(() => reject(new CliError(NOT_RUNNING))));
    socket.on("close", () => finish(() => reject(new CliError("Die Weft-App hat die Verbindung beendet."))));
  });
}

export interface LiveStatus {
  app: string;
  version: string;
  mode: "off" | "read" | "edit";
  editing: boolean;
  title: string | null;
  filePath: string | null;
  moduleId: string | null;
  formatVersion: number;
}

export function liveStatus(): Promise<LiveStatus> {
  return liveCall<LiveStatus>("status");
}

/** A readable summary of the status, for `weft status`. */
export function liveStatusText(status: LiveStatus): string {
  const mode = { off: "aus", read: "nur lesen", edit: "lesen und ändern" }[status.mode];
  if (status.mode === "off") return `Weft ${status.version} läuft, aber die Schnittstelle für KI-Assistenten ist ausgeschaltet (sie ist es, bis die Person sie zulässt).`;
  return [
    `Weft ${status.version} läuft. Schnittstelle für KI-Assistenten: ${mode}.`,
    status.editing ? `Offen: „${status.title}"${status.filePath ? ` (${status.filePath})` : " (noch nicht gespeichert)"}, Dateiformat ${status.formatVersion}.` : "Es ist kein Lernmodul zum Bearbeiten offen (Startseite).",
  ].join("\n");
}

export interface LiveCopy {
  /** A .weft file in a temporary folder with the module as it is in the app now. */
  path: string;
  content: WeftModule;
  formatVersion: number;
  cleanup(): void;
}

/**
 * The open module as a temporary file. `assets`: with the real bytes of its pictures, videos and fonts (for drawing and playing); without,
 * the files are there by name only (what reading and changing need: the check "is the file in the archive" finds them).
 */
export async function liveCopy(options: { assets: boolean }): Promise<LiveCopy> {
  const read = await liveCall<{ formatVersion: number; content: WeftModule; blobs: { id: string; size: number }[] }>("read");
  const files: Zippable = { "weft.json": strToU8(JSON.stringify({ formatVersion: read.formatVersion, content: read.content })) };
  const names = new Map<string, string>();
  for (const meta of read.content.assets) names.set(meta.id, `assets/${meta.id}_${meta.fileName}`);
  for (const font of read.content.customFonts ?? []) names.set(font.id, `assets/${font.id}`);
  for (const blob of read.blobs) {
    const name = names.get(blob.id) ?? `assets/${blob.id}`;
    const bytes = options.assets ? Buffer.from((await liveCall<{ base64: string }>("asset", { id: blob.id })).base64, "base64") : new Uint8Array(0);
    files[name] = [new Uint8Array(bytes), { level: 0 }];
  }
  const folder = mkdtempSync(join(tmpdir(), "weft-live-"));
  const path = join(folder, "offen.weft");
  writeFileSync(path, zipSync(files));
  return { path, content: read.content, formatVersion: read.formatVersion, cleanup: () => rmSync(folder, { recursive: true, force: true }) };
}

/** Sends what an edit changed (`before` -> `after`, plus new files) to the app: applied there as one step of the undo history. */
export async function applyLive(
  before: WeftModule,
  after: WeftModule,
  assets: { id: string; fileName: string; mimeType: string; bytes: Uint8Array }[],
  label: string,
): Promise<{ applied: number; skipped: number }> {
  const patches = diffJson(before, after);
  return liveCall("apply", {
    patches,
    label,
    assets: assets.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, base64: Buffer.from(a.bytes).toString("base64") })),
  });
}

/** Shows a module (a .weft file) in the app, as a new module of its own that is not saved anywhere yet - the file itself is not touched. */
export async function openInApp(file: string): Promise<void> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    throw new CliError(`Die Datei „${file}" lässt sich nicht lesen: ${(error as Error).message}`);
  }
  await liveCall("open", { base64: bytes.toString("base64") });
}
