import { solutionPlaceholderText } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { SolutionBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";

/** A solution word as it is drawn - the canvas and the thumbnails (what the player makes of it is in player.runtime.js: renderSolutionBlock). The field is
 * shown empty, with the words that stand in it, as a learner meets it, and nothing here can be used. It has the look of a quiz's answer and its button
 * (App.css, .weft-thumb-block-quiz-*), which follow the style of the module's interactive elements. */
export function SolutionView({ block, lang, defaultLang }: { block: SolutionBlock; lang: string | null; defaultLang: string | null }) {
  const strings = playerStringsFor(lang);
  const placeholder = solutionPlaceholderText(block, lang, defaultLang).trim() || strings.solutionWord;
  return (
    <div className="weft-thumb-block-quiz weft-solution-view">
      <div className="weft-thumb-block-quiz-options">
        <div className="weft-thumb-block-quiz-option">
          <span className="weft-thumb-block-quiz-option-text weft-solution-view-hint">{placeholder}</span>
        </div>
      </div>
      <div className="weft-thumb-block-quiz-submit">
        <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
        {strings.submit}
      </div>
    </div>
  );
}
