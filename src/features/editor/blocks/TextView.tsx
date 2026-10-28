import { renderText } from "../../../core/blocks/text/render.js";
import type { TextRenderContext, TextRenderProps } from "../../../core/blocks/text/render.js";
import { textHtml } from "../../../core/document/translations";
import { withProgress } from "../../../core/document/variablePlaceholders";
import type { TextBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A text as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/text/render.js). The words are cut off at the
 * edge of the block (they do not scroll). (On the canvas the words of a selected text are written in place: BlockView's own.)
 */
export function TextView({ block, lang, defaultLang, mode, progress }: { block: TextBlock; lang: string | null; defaultLang: string | null; mode: TextRenderContext["mode"]; progress?: number | null }) {
  const props: TextRenderProps = { html: withProgress(textHtml(block, lang, defaultLang), progress), scrollable: !!block.scrollable, box: block.box };
  return <RenderHost render={renderText} props={props} ctx={{ mode }} />;
}
