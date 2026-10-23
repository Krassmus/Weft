import { linkText } from "../../../core/document/translations";
import type { LinkBlock } from "../../../core/types";
import { linkIconSvg } from "../../../core/runtime/linkIcons.js";

/** A link as it is drawn - the canvas and the thumbnails (what the player makes of it is in player.runtime.js: renderLinkBlock). Not clickable here. */
export function LinkView({ block, lang, defaultLang }: { block: LinkBlock; lang: string | null; defaultLang: string | null }) {
  const text = linkText(block, lang, defaultLang).trim();
  return (
    <div className="weft-link">
      <span className="weft-link-icon" dangerouslySetInnerHTML={{ __html: linkIconSvg(block.download) }} />
      {text && <span className="weft-link-text">{text}</span>}
    </div>
  );
}
