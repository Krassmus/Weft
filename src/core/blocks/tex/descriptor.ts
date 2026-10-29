import type { TexBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * A TeX formula (KaTeX, display mode). It is scaled to fit its box like a picture; the colour is the whole formula's, anything else is written into the
 * formula itself. Not translated. Drawn by BlockView, SlideThumbnail and the player's renderTexBlock (the exported page carries KaTeX's CSS and fonts when
 * a formula is on it: buildRuntimeHtml.ts).
 */
export const texBlock: BlockDescriptor<TexBlock> = {
  kind: "tex",
  version: 1,
  cliName: "Formel",
  schemaDefinition: "TexBlock",
  description: "Eine TeX-Formel (`tex`, mit KaTeX im Display-Modus gesetzt, Zeilen mit \\\\ getrennt), die in ihren Block passt wie ein Bild; `color` färbt die ganze Formel (leer: die Textfarbe der Folie).",
  placement: { pageOnly: false, box: { x: 25, y: 35, width: 50, height: 30 } },
  fields: {
    tex: { type: "text", shown: true, sample: "\\frac{a}{b}" },
    color: { type: "text", sample: "#ff0000" },
  },
  defaults: () => ({ kind: "tex", tex: "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}", color: "" }),
  summary: (block) => block.tex.slice(0, 60),
};
