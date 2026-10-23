import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { CURRENT_FORMAT_VERSION } from "../src/core/types";
import type { WeftFileJson, WeftModule } from "../src/core/types";

/** An error the tool reports to the person (or the AI) running it - without a stack trace. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 2,
  ) {
    super(message);
  }
}

export interface LoadedWeft {
  path: string;
  json: WeftFileJson;
  content: WeftModule;
  /** The names of the files in the archive (empty for a bare weft.json). */
  files: Set<string>;
  /** Whether it was read from a .weft archive (else a bare weft.json: the media are not there to be checked). */
  archive: boolean;
}

/** Reads a .weft file (or a weft.json by itself). Nothing is migrated: what is read is what is in the file. */
export function loadWeft(path: string): LoadedWeft {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    throw new CliError(`Die Datei „${path}" lässt sich nicht lesen: ${(error as Error).message}`);
  }
  const files = new Set<string>();
  let jsonText: string;
  let archive = true;
  if (path.toLowerCase().endsWith(".json")) {
    jsonText = bytes.toString("utf8");
    archive = false;
  } else {
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(new Uint8Array(bytes), {
        filter: (file) => {
          files.add(file.name);
          return file.name === "weft.json";
        },
      });
    } catch {
      throw new CliError(`„${path}" ist keine Weft-Datei (kein gültiges Zip-Archiv).`);
    }
    const raw = unzipped["weft.json"];
    if (!raw) {
      throw new CliError(
        `„${path}" enthält kein weft.json. Eine als Player oder HTML exportierte Datei lässt sich nicht lesen - dafür wird die .weft-Datei gebraucht.`,
      );
    }
    jsonText = strFromU8(raw);
  }
  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch (error) {
    throw new CliError(`weft.json in „${path}" ist kein gültiges JSON: ${(error as Error).message}`);
  }
  const object = json as Partial<WeftFileJson> | null;
  if (!object || typeof object !== "object" || typeof object.formatVersion !== "number" || !object.content || typeof object.content !== "object") {
    throw new CliError(`weft.json in „${path}" hat nicht die erwartete Form ({ formatVersion, content }).`);
  }
  return { path, json: object as WeftFileJson, content: object.content as WeftModule, files, archive };
}

/**
 * What to tell about a file whose format is not the one this tool writes (null: it is). The tool does not migrate: what it reads is what is
 * in the file - so a newer file may have fields it does not know, and an older one has a shape the operations are not made for.
 */
export function formatNotice(formatVersion: number): string | null {
  if (formatVersion > CURRENT_FORMAT_VERSION) {
    return `Die Datei hat das neuere Format ${formatVersion}; dieses Werkzeug kennt bis ${CURRENT_FORMAT_VERSION}. Es kann Angaben nicht sehen oder falsch deuten - das Werkzeug auf die Version der Weft-App bringen, die die Datei gespeichert hat (weft version zeigt, welche es ist).`;
  }
  if (formatVersion < CURRENT_FORMAT_VERSION) {
    return `Die Datei hat das ältere Format ${formatVersion} (aktuell ${CURRENT_FORMAT_VERSION}) und wird nicht umgewandelt: Meldungen können von dem abweichen, was Weft nach dem Öffnen zeigt. Zum Ändern die Datei einmal in Weft öffnen und speichern.`;
  }
  return null;
}

/** Changing a file of another format is refused: written back, it would be a mixture of its shape and the one of the operations. */
export function requireCurrentFormat(loaded: LoadedWeft, what: string): void {
  const notice = formatNotice(loaded.json.formatVersion);
  if (notice) throw new CliError(`„${loaded.path}" wird nicht ${what}. ${notice}`);
}

export { CURRENT_FORMAT_VERSION };
