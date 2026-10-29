import type { FilesBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * The box with files to download: a heading and a list of the module's files (`files`: the id of each entry is the id of its asset), optionally behind
 * a password (`protection`: what is needed to check it, never the password). The list and the protection are not fields: they are made by dropping files
 * on the block and by a dialog (filesActions.ts), and the files it holds are found by usedAssets.ts. Drawn by BlockView, SlideThumbnail and the
 * player's renderFilesBlock.
 */
export const filesBlock: BlockDescriptor<FilesBlock> = {
  kind: "files",
  version: 1,
  cliName: "Dateien",
  schemaDefinition: "FilesBlock",
  description: "Ein Kasten mit Dateien zum Herunterladen: eine Überschrift (`title`, leer: „Dateien“) und die Liste der Dateien (`files`), auf Wunsch hinter einem Passwort (`protection`).",
  placement: { pageOnly: false, box: { x: 30, y: 35, width: 40, height: 30 } },
  fields: {
    title: { type: "text" },
  },
  defaults: () => ({ kind: "files", title: "", files: [], protection: null }),
  summary: (block) => `${block.files.length} Dateien${block.protection ? ", geschützt" : ""}`,
};
