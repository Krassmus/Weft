import { tr } from "../../i18n/tr";
import type { ClozeBlock } from "../../types";
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
 * The gap text: a formatted text in which `[[Berlin]]` is a blank - an input field in the player - and an "Abschicken" under it that marks which answers
 * were right (see ClozeBlock). Like a quiz it is graded and has its events in the page's graph. Drawn by one function for the player, the
 * thumbnails and the PDF (blocks/cloze/render.js, which also judges an answer); what a submit does - the changes to variables, the score, the required
 * task, the events - is the player's (renderClozeBlock). On the canvas the text is written in place with the blanks as they are written, `[[answer]]`
 * (ClozeBlockCanvas in blocks/BlockView.tsx: `ownCanvas`), and the panel (ClozeEditor in panels/BlockPanel.tsx) lists what was recognised - both the
 * editor's own.
 */
export const clozeBlock: BlockDescriptor<ClozeBlock> = {
  kind: "cloze",
  version: 1,
  cliName: "Lückentext",
  schemaDefinition: "ClozeBlock",
  description: "Lückentext: Antworten stehen als [[Antwort]] im Text.",
  placement: { pageOnly: true, box: { x: 10, y: 28, width: 80, height: 45 } },
  fields: {
    // The text, the blanks written as [[answer]] (or [[answer|another answer]]): a translation has to keep as many of them.
    html: { type: "html", blanks: true, translatable: true, shown: true, variables: true, cli: { part: "html", role: "Lückentext" } },
    caseSensitive: { type: "bool" },
    tolerance: { type: "int", min: 0 },
    required: { type: "bool" },
    onEachCorrect: { type: "effects", cliWhat: "bei jeder richtigen Lücke" },
    answerEffects: { type: "effectsMap", cliWhat: "bei einer bestimmten Antwort" },
    onCorrect: { type: "effects", firesOn: "richtig", cliWhat: "wenn alles richtig ist" },
    onIncorrect: { type: "effects", firesOn: "falsch", cliWhat: "wenn etwas falsch ist" },
  },
  defaults: () => ({ kind: "cloze", html: tr("ui.cloze_sample_text"), onEachCorrect: [], onCorrect: [], onIncorrect: [] }),
  task: {
    labels: { fill: "ui.fill_in", submit: "ui.gap_text_submitted", correct: "ui.gap_text_submitted_correct", incorrect: "ui.gap_text_submitted_incorrect" },
    cliNames: {
      fill: "Lückentext: erste Eingabe",
      submit: "Lückentext abgeschickt",
      correct: "Lückentext abgeschickt (alles richtig)",
      incorrect: "Lückentext abgeschickt (etwas falsch)",
    },
  },
  summary: (block) => clip(block.html, 70) || "(leer)",
  validate: (block) =>
    /\[\[[^\]]+\]\]/.test(block.html)
      ? []
      : [{ level: "warning", code: "cloze-no-blanks", message: "Der Lückentext hat keine Lücke (Antworten stehen als [[Antwort]] im Text)." }],
};
