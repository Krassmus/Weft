import { existsSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { strToU8, unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";
import { CliError } from "./load";
import type { WeftFileJson } from "../src/core/types";

/** Files that describe an editing history or the player of the module as it was: not true any more once the content was changed
 * from outside. Weft makes the player again on the next save, and starts a new history. */
const STALE = new Set(["weft.automerge", "weft.collab.json", "index.html"]);

/**
 * Writes `json` as a new .weft file made from `source` (an existing archive): everything else in it - the pictures, the videos, the
 * fonts - is copied as it is. Never overwrites a file that is there unless `force`.
 */
export function writeWeft(source: string, json: WeftFileJson, target: string, force = false): void {
  if (existsSync(target) && !force) {
    throw new CliError(`Die Datei „${target}" gibt es schon. Anderen Namen mit -o wählen oder --force zum Überschreiben.`);
  }
  const files: Zippable = {};
  if (!source.toLowerCase().endsWith(".json")) {
    const all = unzipSync(new Uint8Array(readFileSync(source)));
    for (const [name, data] of Object.entries(all)) {
      if (name === "weft.json" || STALE.has(name)) continue;
      // Pictures and videos are compressed already.
      files[name] = [data, { level: name.startsWith("assets/") ? 0 : 6 }];
    }
  }
  files["weft.json"] = strToU8(JSON.stringify(json, null, 2));
  if (target.toLowerCase().endsWith(".json")) {
    writeFileSync(target, JSON.stringify(json, null, 2));
  } else {
    writeFileSync(target, zipSync(files));
  }
}
