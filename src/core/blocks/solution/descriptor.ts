import type { SolutionBlock } from "../../types";
import type { BlockDescriptor } from "../types";

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The solution word: a field for a word and "Abschicken", nothing else (see SolutionBlock). The first block to be described this way - what is
 * said here is what the menu, the defaults, the translations, the event graph, the text export, `weft inspect` and `weft validate` know of it;
 * its panel is made from the fields (panels/FieldsPanel.tsx). How it looks and works is in its views: the editor's (blocks/SolutionView.tsx) and
 * the player's (renderSolutionBlock in runtime/player.runtime.js).
 */
export const solutionBlock: BlockDescriptor<SolutionBlock> = {
  kind: "solution",
  version: 1,
  cliName: "Lösungswort",
  schemaDefinition: "SolutionBlock",
  description:
    "Lösungswort: ein Feld für ein Wort und „Abschicken“, mehr nicht. Richtig ist das Wort `solution` (Groß-/Kleinschreibung zählt nur mit `caseSensitive`); `attempts` begrenzt die Versuche (fehlt: beliebig viele). Hat die Ereignisse eines Quiz („richtig“ ist die Lösung), an denen im Event-Graphen alles hängen kann, und Variablen-Effekte (onCorrect einmal, onIncorrect bei jedem falschen Versuch). Nur auf Folien.",
  placement: { pageOnly: true, box: { x: 25, y: 34, width: 50, height: 32 } },
  fields: {
    // The right word is of the language the learner works in: "dog", not "Hund", in the English one.
    solution: { type: "text", translatable: true, cli: { part: "solution", role: "Lösungswort (das richtige Wort)" }, ui: { label: "ui.solution_word", plain: true } },
    // (What stands in the empty field is kept as `text` in a translation.)
    placeholder: {
      type: "text",
      translatable: true,
      translationKey: "text",
      shown: true,
      variables: true,
      cli: { part: "label", role: "Text im leeren Feld" },
      ui: { label: "ui.solution_placeholder", placeholderString: "solutionWord" },
    },
    caseSensitive: { type: "bool", ui: { label: "ui.solution_case" } },
    attempts: {
      type: "int",
      min: 1,
      ui: { label: "ui.solution_attempts", unsetLabel: "ui.solution_attempts_unlimited", setLabel: "ui.solution_attempts_limited", countLabel: "ui.solution_attempts_count", hint: "ui.solution_attempts_hint" },
    },
    required: { type: "bool", ui: { label: "ui.required_task", hint: "ui.required_task_hint" } },
    onCorrect: { type: "effects", firesOn: "richtig", cliWhat: "wenn das Wort richtig ist", ui: { label: "ui.solution_when_correct", advanceHint: "ui.happens_1_5_seconds_after_correct" } },
    onIncorrect: { type: "effects", firesOn: "falsch", cliWhat: "bei jedem falschen Versuch", ui: { label: "ui.solution_when_wrong", advanceHint: "ui.happens_1_5_seconds_after_the" } },
  },
  panel: {
    sections: [
      { title: "ui.solution", hint: "ui.solution_hint", language: true, fields: ["solution", "caseSensitive", "placeholder", "attempts", "required"] },
      { title: "ui.solution_when_correct", open: false, fields: ["onCorrect"] },
      { title: "ui.solution_when_wrong", open: false, fields: ["onIncorrect"] },
    ],
  },
  defaults: () => ({ kind: "solution", solution: "", onCorrect: [], onIncorrect: [] }),
  task: {
    labels: { fill: "ui.solution_first", submit: "ui.solution_submitted", correct: "ui.solution_submitted_correct", incorrect: "ui.solution_submitted_incorrect" },
    cliNames: {
      fill: "Lösungswort: erster Buchstabe getippt",
      submit: "Lösungswort abgeschickt",
      correct: "Lösungswort abgeschickt (richtig)",
      incorrect: "Lösungswort abgeschickt (falsch)",
    },
    outcomesAlwaysShown: true,
  },
  summary: (block) =>
    `Lösung: „${clip(block.solution ?? "", 40) || "(fehlt)"}"${block.caseSensitive ? " [Groß-/Kleinschreibung zählt]" : ""}${block.attempts ? ` [${block.attempts} Versuch${block.attempts === 1 ? "" : "e"}]` : ""}${block.required ? " [Pflicht]" : ""}`,
  validate: (block) => [
    ...((block.solution ?? "").trim() === "" ? [{ level: "warning" as const, code: "solution-empty", message: "Das Lösungswort hat noch keine Lösung (solution): so ist jede Eingabe falsch." }] : []),
    ...(block.attempts !== undefined && (!Number.isInteger(block.attempts) || block.attempts < 1)
      ? [{ level: "error" as const, code: "solution-attempts", message: "Die Zahl der Versuche (attempts) ist eine ganze Zahl ab 1 - oder fehlt für beliebig viele." }]
      : []),
  ],
};
