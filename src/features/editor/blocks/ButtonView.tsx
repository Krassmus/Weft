import { buttonLookStyle, renderButton } from "../../../core/blocks/button/render.js";
import type { ButtonRenderContext, ButtonRenderProps } from "../../../core/blocks/button/render.js";
import { fieldHtml, fieldWording } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { ButtonBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A button as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/button/render.js). A picture of a button -
 * nothing here can be clicked. (On the canvas the label is written in place: BlockView's own.)
 */
export function ButtonView({ block, lang, defaultLang, mode }: { block: ButtonBlock; lang: string | null; defaultLang: string | null; mode: ButtonRenderContext["mode"] }) {
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  // (A label with no words stands for the player's own "Weiter".)
  const props: ButtonRenderProps = {
    html: fieldWording(block, "text", lang, defaultLang).trim() ? fieldHtml(block, "text", lang, defaultLang) : "",
    look: buttonLookStyle(block.appearance),
  };
  const ctx: ButtonRenderContext = { mode, text: (key) => strings[key] ?? "" };
  return <RenderHost render={renderButton} props={props} ctx={ctx} />;
}
