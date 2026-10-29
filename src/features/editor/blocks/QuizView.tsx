import { renderQuiz } from "../../../core/blocks/quiz/render.js";
import type { QuizRenderContext, QuizRenderProps } from "../../../core/blocks/quiz/render.js";
import { quizExplanation, quizOptionHtml, quizQuestionHtml } from "../../../core/document/translations";
import { withProgress } from "../../../core/document/variablePlaceholders";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { QuizBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import checkboxCheckedSvg from "../../../../mockups/icons/checkbox-checked.svg?raw";
import checkboxUncheckedSvg from "../../../../mockups/icons/checkbox-unchecked.svg?raw";
import { RenderHost } from "./RenderHost";

// The round buttons of a quiz where only one answer can be picked (the same drawing the player has).
export const RADIO_UNCHECKED_SVG =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" fill="#28497c"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0m0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/></svg>';
export const RADIO_CHECKED_SVG =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" fill="#28497c"><path d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0m0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/></svg>';

/**
 * A quiz as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/quiz/render.js), as the question, the answers and
 * the button, as a learner meets them - except that a thumbnail shows the right answers ticked (a PDF does not give them away: nothing is marked there).
 * Nothing here can be used. (On the canvas the question and the answers are written in place and the right ones marked: QuizBlockCanvas in
 * BlockView.tsx.)
 */
export function QuizView({ block, lang, defaultLang, mode, progress }: { block: QuizBlock; lang: string | null; defaultLang: string | null; mode: QuizRenderContext["mode"]; progress?: number | null }) {
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: QuizRenderProps = {
    id: block.id,
    question: withProgress(quizQuestionHtml(block, lang, defaultLang), progress),
    options: block.options.map((option) => ({ id: option.id, html: withProgress(quizOptionHtml(block, option.id, lang, defaultLang), progress) })),
    correctOptionIds: block.correctOptionIds,
    open: block.open,
    single: block.single,
    explanation: quizExplanation(block, lang, defaultLang),
    marked: mode === "print" || block.open ? [] : block.correctOptionIds,
  };
  const ctx: QuizRenderContext = {
    mode,
    text: (key) => strings[key] ?? "",
    icons: { submit: acceptSvg, correct: "", incorrect: "", unchecked: checkboxUncheckedSvg, checked: checkboxCheckedSvg, radioUnchecked: RADIO_UNCHECKED_SVG, radioChecked: RADIO_CHECKED_SVG },
    fill: () => {},
    submit: () => {},
    announce: () => {},
  };
  return <RenderHost render={renderQuiz} props={props} ctx={ctx} />;
}
