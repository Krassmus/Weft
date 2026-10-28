import { renderChecker } from "../../../core/blocks/checker/render.js";
import type { CheckerRenderContext, CheckerRenderProps } from "../../../core/blocks/checker/render.js";
import { fieldWording } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { CheckerBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import checkboxCheckedSvg from "../../../../mockups/icons/checkbox-checked.svg?raw";
import checkboxUncheckedSvg from "../../../../mockups/icons/checkbox-unchecked.svg?raw";
import { RenderHost } from "./RenderHost";

/** The icons of a checker (the player has its own copies of the same pictures). */
export const CHECKER_ICONS = { submit: acceptSvg, thanks: "", unchecked: checkboxUncheckedSvg, checked: checkboxCheckedSvg };

/**
 * A checker as it is drawn - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/checker/render.js), as the
 * unticked box and the button, as a learner meets them. Nothing here can be used. (The words of a selected block are written in place on the canvas:
 * CheckerCanvas.)
 */
export function CheckerView({ block, lang, defaultLang, mode }: { block: CheckerBlock; lang: string | null; defaultLang: string | null; mode: CheckerRenderContext["mode"] }) {
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: CheckerRenderProps = { id: block.id, text: fieldWording(block, "text", lang, defaultLang) };
  const ctx: CheckerRenderContext = {
    mode,
    text: (key) => strings[key] ?? "",
    icons: CHECKER_ICONS,
    fill: () => {},
    submit: () => {},
    announce: () => {},
  };
  return <RenderHost render={renderChecker} props={props} ctx={ctx} />;
}
