import { createId } from "../../id";
import { tr } from "../../i18n/tr";
import type { QuizBlock } from "../../types";
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
 * The quiz: a question and answers to tick (see QuizBlock) - one right, several right, or an open question where nothing is right or wrong - with an
 * "Abschicken" under them and, once it was submitted, "richtig" or "falsch" (or "Danke!") and an explanation. It is graded: the changes to variables
 * for the quiz as a whole and for every option, the score, the required task and the events in the page's graph (the first answer, submitted -
 * plain, and right / wrong). Drawn by one function for the player, the thumbnails and the PDF (blocks/quiz/render.js); what a submit does is the
 * player's (renderQuizBlock). On the canvas the question and the answers are written in place and the right ones are marked (QuizBlockCanvas in
 * blocks/BlockView.tsx: `ownCanvas`), and the panel (QuizEditor in panels/BlockPanel.tsx) is the editor's own too.
 */
export const quizBlock: BlockDescriptor<QuizBlock> = {
  kind: "quiz",
  version: 1,
  cliName: "Quiz",
  schemaDefinition: "QuizBlock",
  description: "Frage mit Antwortoptionen; richtig/falsch löst Variablen-Effekte und Ereignisse aus.",
  placement: { pageOnly: true, box: { x: 10, y: 28, width: 80, height: 50 } },
  fields: {
    // The question: formatted words, kept as `questionHtml` in a translation too.
    questionHtml: { type: "html", translationKey: "questionHtml", translatable: true, shown: true, variables: true, cli: { part: "question", role: "Frage" } },
    // The answers: formatted words (their translations are `options[id]`), and what happens when one is handled right or wrong.
    options: {
      type: "list",
      translationKey: "options",
      cliPart: "option",
      item: {
        html: { type: "html", translatable: true, shown: true, variables: true },
        onRight: { type: "effects", cliWhat: "bei richtig behandelter Option" },
        onWrong: { type: "effects", cliWhat: "bei falsch behandelter Option" },
      },
      newItem: () => ({ id: createId(), html: "" }),
      history: { add: "Antwort hinzufügen", addMany: "Antworten hinzufügen", change: "Antwort ändern" },
      cliRole: (number) => `Antwort ${number}`,
    },
    correctOptionIds: { type: "ids", of: "options" },
    open: { type: "bool" },
    required: { type: "bool" },
    onCorrect: { type: "effects", firesOn: "richtig", cliWhat: "bei richtiger Antwort" },
    onIncorrect: { type: "effects", firesOn: "falsch", cliWhat: "bei falscher Antwort" },
    // What is told under the "right" / "wrong" (plain text, lines are kept).
    explanation: { type: "text", translatable: true, cli: { part: "explanation", role: "Erklärung nach dem Abschicken" } },
  },
  defaults: () => ({
    kind: "quiz",
    questionHtml: tr("ui.new_question"),
    options: [
      { id: createId(), html: tr("ui.option_a") },
      { id: createId(), html: tr("ui.option_b") },
    ],
    correctOptionIds: [],
    onCorrect: [],
    onIncorrect: [],
  }),
  task: {
    labels: { fill: "ui.fill_in", submit: "ui.quiz_submitted", correct: "ui.quiz_submitted_correct", incorrect: "ui.quiz_submitted_incorrect" },
    cliNames: {
      fill: "Quiz: erste Antwort gewählt",
      submit: "Quiz abgeschickt",
      correct: "Quiz richtig abgeschickt",
      incorrect: "Quiz falsch abgeschickt",
    },
  },
  summary: (block) => `${clip(block.questionHtml, 80) || "(ohne Frage)"} [${block.options.length} Optionen${block.open ? ", offen" : `, ${block.correctOptionIds.length} richtig`}]`,
  validate: (block) => {
    const problems: ReturnType<NonNullable<typeof quizBlock.validate>> = [];
    const ids = new Set(block.options.map((option) => option.id));
    for (const id of block.correctOptionIds) {
      if (!ids.has(id)) problems.push({ level: "error", code: "quiz-correct-missing", message: "Das Quiz nennt eine richtige Option, die es nicht gibt.", hint: "correctOptionIds auf vorhandene Option-Ids beschränken." });
    }
    if (!block.open && block.correctOptionIds.length === 0) {
      problems.push({ level: "warning", code: "quiz-no-correct", message: "Das Quiz hat keine richtige Option und ist nicht offen.", hint: "Mindestens eine Option in correctOptionIds eintragen (oder open: true setzen)." });
    }
    if (block.options.length < 2 && !block.open) problems.push({ level: "info", code: "quiz-few-options", message: "Das Quiz hat weniger als zwei Optionen." });
    return problems;
  },
};
