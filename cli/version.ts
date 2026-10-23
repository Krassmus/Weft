import { existsSync } from "node:fs";
import { CURRENT_FORMAT_VERSION } from "../src/core/types";
import packageJson from "../package.json";
import { findChrome } from "./render";

/** The version of this tool: that of the Weft it is built from (package.json, which tauri.conf.json carries too). */
export const TOOL_VERSION: string = packageJson.version;

export interface VersionInfo {
  tool: "weft";
  version: string;
  /** The format of the files it writes and changes; files of this format are read and changed. */
  formatVersion: number;
  /** Older files are only read (not migrated), newer ones are refused for changes. */
  node: string;
  /** The browser `render`, `play` and `validate --layout` draw with, or null. */
  chrome: string | null;
}

export function versionInfo(): VersionInfo {
  let chrome: string | null = null;
  try {
    const found = findChrome();
    chrome = existsSync(found) ? found : null;
  } catch {
    chrome = null;
  }
  return { tool: "weft", version: TOOL_VERSION, formatVersion: CURRENT_FORMAT_VERSION, node: process.version, chrome };
}

export function versionText(info: VersionInfo): string {
  return [
    `weft ${info.version}`,
    `Dateiformat ${info.formatVersion}: Dateien dieses Formats werden gelesen und geändert; ältere nur gelesen (nicht umgewandelt), neuere beim Ändern abgelehnt.`,
    `Node ${info.node}`,
    `Browser zum Zeichnen: ${info.chrome ?? "keiner gefunden (nötig für render, play, validate --layout; Pfad in WEFT_CHROME)"}`,
  ].join("\n");
}
