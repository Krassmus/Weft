import { linkCss } from "../../../core/document/linkLook";
import { linkText } from "../../../core/document/translations";
import { tr } from "../../../core/i18n/tr";
import type { LinkBlock } from "../../../core/types";
import { linkIconSvg } from "../../../core/runtime/linkIcons.js";

/** A link as it is drawn - the canvas and the thumbnails (what the player makes of it is in player.runtime.js: renderLinkBlock). Not clickable here. */
export function LinkView({ block, lang, defaultLang, showEmptyHint = false }: { block: LinkBlock; lang: string | null; defaultLang: string | null; showEmptyHint?: boolean }) {
  const text = linkText(block, lang, defaultLang).trim();
  const icon = linkIconSvg(block.icon);
  return (
    <div className={"weft-link" + (block.background ? " has-background" : "")} style={linkCss(block)}>
      {icon && <span className="weft-link-icon" dangerouslySetInnerHTML={{ __html: icon }} />}
      {text && <span className="weft-link-text">{text}</span>}
      {!text && !icon && showEmptyHint && <span className="weft-link-empty">{tr("ui.link_nothing_to_show")}</span>}
    </div>
  );
}
