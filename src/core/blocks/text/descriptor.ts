import { tr } from "../../i18n/tr";
import type { TextBlock } from "../../types";
import type { BlockDescriptor } from "../types";

// The words of some html, as `weft inspect` shows them (translations.ts's plainTextOfHtml: the registry cannot import that file).
const clip = (html: string, max: number) => {
  const plain = html
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The text: formatted words (HTML, in `html`), optionally in a box (a background and a border - `box`) and scrollable. Drawn by one function for the
 * player, the thumbnails and the PDF (blocks/text/render.js); on the canvas the words are written in place with the editor's rich text, which is the
 * editor's own (BlockView.tsx: `ownCanvas`) - and so is its panel (TextEditor, TextBoxEditor in panels/BlockPanel.tsx). `box` and `placeholderOf`
 * (the layout's placeholder the text belongs to) are not fields: they are objects / ids no station reads as words.
 */
export const textBlock: BlockDescriptor<TextBlock> = {
  kind: "text",
  version: 1,
  cliName: "Text",
  schemaDefinition: "TextBlock",
  description: "Ein Text (formatiertes HTML in `html`; Übersetzungen in `translations`).",
  placement: { pageOnly: false, box: { x: 10, y: 40, width: 80, height: 20 } },
  fields: {
    html: { type: "html", translatable: true, shown: true, variables: true, cli: { part: "html", role: "Text" } },
    scrollable: { type: "bool" },
  },
  defaults: () => ({ kind: "text", html: tr("ui.new_text") }),
  summary: (block) => clip(block.html, 70) || "(leer)",
};
