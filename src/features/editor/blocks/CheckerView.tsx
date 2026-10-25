import { checkerText } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { CheckerBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import checkboxUncheckedSvg from "../../../../mockups/icons/checkbox-unchecked.svg?raw";

/** A checker as it is drawn - the canvas and the thumbnails (what the player makes of it is in player.runtime.js: renderCheckerBlock). The box is
 * shown empty, as a learner meets it, and nothing here can be clicked. It uses the look of a quiz's one answer and its button
 * (App.css, .weft-thumb-block-quiz-*), which follow the style of the module's interactive elements. */
export function CheckerView({ block, lang, defaultLang }: { block: CheckerBlock; lang: string | null; defaultLang: string | null }) {
  return (
    <div className="weft-thumb-block-quiz weft-checker-view">
      <div className="weft-thumb-block-quiz-options">
        <div className="weft-thumb-block-quiz-option">
          <span className="weft-thumb-block-quiz-option-checkbox" dangerouslySetInnerHTML={{ __html: checkboxUncheckedSvg }} />
          <span className="weft-thumb-block-quiz-option-text weft-checker-view-text">{checkerText(block, lang, defaultLang)}</span>
        </div>
      </div>
      <div className="weft-thumb-block-quiz-submit">
        <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
        {playerStringsFor(lang).submit}
      </div>
    </div>
  );
}
