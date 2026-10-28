import type { LanguageBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * The language switch: a drop-down with which a learner picks the language of the module (see LanguageBlock). It has no settings of its own. Drawn by
 * one function for the player, the canvas, the thumbnails and the PDF (blocks/language/render.js): a real drop-down in the player and on the canvas,
 * a grey box with a globe where it cannot be used. (It can be added only while the module offers more than one language: AddElementMenu.tsx.)
 */
export const languageBlock: BlockDescriptor<LanguageBlock> = {
  kind: "language",
  version: 1,
  cliName: "Sprachumschalter",
  schemaDefinition: "LanguageBlock",
  description: "Sprachumschalter (nur sinnvoll in mehrsprachigen Modulen).",
  placement: { pageOnly: false, box: { x: 74, y: 3, width: 23, height: 7 } },
  fields: {},
  defaults: () => ({ kind: "language" }),
  summary: () => "Sprachumschalter",
};
