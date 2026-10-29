import { DEFAULT_CODE_THEME } from "../../code/codeThemes";
import type { CodeBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * A piece of program code, highlighted (highlight.js): the code, the language it is in (or "auto"), the colours (`theme`) and the size of the type. The
 * words of it are not translated and nothing is put in for a {{placeholder}}: it is shown as it is. Drawn by BlockView, SlideThumbnail and the player's
 * renderCodeBlock (which the exported page needs the highlighter and the theme's CSS for: buildRuntimeHtml.ts).
 */
export const codeBlock: BlockDescriptor<CodeBlock> = {
  kind: "code",
  version: 1,
  cliName: "Code",
  schemaDefinition: "CodeBlock",
  description: "Ein Stück Programmtext mit Syntaxfarben: der Text (`code`), die Sprache (`language`, eine Kennung von highlight.js oder \"auto\"), das Farbschema (`theme`), die Schriftgröße (`fontSize`) und `transparentBackground` (ohne den Hintergrund des Schemas).",
  placement: { pageOnly: false, box: { x: 10, y: 30, width: 80, height: 40 } },
  fields: {
    code: { type: "text", shown: true },
    language: { type: "text", sample: "javascript" },
    theme: { type: "text", sample: DEFAULT_CODE_THEME },
    fontSize: { type: "number", min: 1 },
    transparentBackground: { type: "bool" },
  },
  defaults: () => ({
    kind: "code",
    code: 'function greet(name) {\n  return "Hello, " + name + "!";\n}\n\nconsole.log(greet("Weft"));',
    language: "javascript",
    theme: DEFAULT_CODE_THEME,
    fontSize: 13,
  }),
  summary: (block) => `${block.language}: ${(block.code.split("\n")[0] ?? "").slice(0, 50)}`,
};
