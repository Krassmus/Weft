import { tr } from "../../i18n/tr";
import type { CheckerBlock } from "../../types";
import type { BlockDescriptor } from "../types";

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The checker: a box to tick with words beside it (a declaration of consent, say) and "Abschicken" (see CheckerBlock). It has the events of a quiz in
 * the page's graph - a first click on the box, submitted, and with the outcome ("richtig" is ticked, "falsch" is not). Drawn by one function for the
 * player, the thumbnails and the PDF (blocks/checker/render.js); on the canvas the same function draws it, and its words are written in place
 * (CheckerCanvas in blocks/CheckerCanvas.tsx) - which is the editor's own. Its words are the one text the panel does not show: they are edited there.
 */
export const checkerBlock: BlockDescriptor<CheckerBlock> = {
  kind: "checker",
  version: 1,
  cliName: "Checker",
  schemaDefinition: "CheckerBlock",
  description:
    "Ein Checker: Kästchen mit Text (zum Beispiel eine Einverständniserklärung) und „Abschicken“; was mit und ohne Haken passiert (Variablen-Effekte, Ereignisse wie bei einem Quiz), optional Pflichtangabe.",
  placement: { pageOnly: true, box: { x: 10, y: 38, width: 80, height: 24 } },
  fields: {
    // The words beside the box (plain text, line breaks are kept).
    text: { type: "text", translatable: true, shown: true, variables: true, cli: { part: "label", role: "Text" } },
    required: { type: "bool", ui: { label: "ui.required_task", hint: "ui.required_task_hint" } },
    onChecked: { type: "effects", firesOn: "richtig", cliWhat: "beim Abschicken mit Haken", ui: { label: "ui.checker_when_ticked", advanceHint: "ui.happens_1_5_seconds_after_correct" } },
    onUnchecked: { type: "effects", firesOn: "falsch", cliWhat: "beim Abschicken ohne Haken", ui: { label: "ui.checker_when_unticked", advanceHint: "ui.happens_1_5_seconds_after_the" } },
  },
  panel: {
    sections: [
      { title: "ui.checker", language: true, fields: ["required"] },
      { title: "ui.checker_when_ticked", open: false, fields: ["onChecked"] },
      { title: "ui.checker_when_unticked", open: false, fields: ["onUnchecked"] },
    ],
  },
  defaults: () => ({ kind: "checker", text: tr("ui.checker_sample_text"), onChecked: [], onUnchecked: [] }),
  task: {
    labels: { fill: "ui.checker_toggled", submit: "ui.checker_submitted", correct: "ui.checker_submitted_ticked", incorrect: "ui.checker_submitted_unticked" },
    cliNames: {
      fill: "Checker: Haken gesetzt oder entfernt",
      submit: "Checker abgeschickt",
      correct: "Checker mit Haken abgeschickt",
      incorrect: "Checker ohne Haken abgeschickt",
    },
  },
  summary: (block) => `„${clip(block.text, 40) || "(ohne Text)"}"${block.required ? " [Pflicht]" : ""}`,
};
