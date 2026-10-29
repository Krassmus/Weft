import { renderCloze } from "../../../core/blocks/cloze/render.js";
import type { ClozeRenderContext, ClozeRenderProps } from "../../../core/blocks/cloze/render.js";
import { textHtml } from "../../../core/document/translations";
import { withProgress } from "../../../core/document/variablePlaceholders";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { ClozeBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import { RenderHost } from "./RenderHost";

/**
 * A gap text as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/cloze/render.js), as the text with its empty
 * fields and the button, as a learner meets them. Nothing here can be used. (On the canvas the text is written in place, the blanks as `[[answer]]`:
 * ClozeBlockCanvas in BlockView.tsx.)
 */
export function ClozeView({ block, lang, defaultLang, mode, progress }: { block: ClozeBlock; lang: string | null; defaultLang: string | null; mode: ClozeRenderContext["mode"]; progress?: number | null }) {
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: ClozeRenderProps = { html: withProgress(textHtml(block, lang, defaultLang), progress), caseSensitive: block.caseSensitive, tolerance: block.tolerance };
  const ctx: ClozeRenderContext = {
    mode,
    text: (key) => strings[key] ?? "",
    textWith: (key, values) => (strings[key] ?? "").replace(/\{(\w+)\}/g, (all, name: string) => (values[name] !== undefined ? String(values[name]) : all)),
    icons: { submit: acceptSvg, correct: "", incorrect: "" },
    fill: () => {},
    submit: () => {},
    announce: () => {},
  };
  return <RenderHost render={renderCloze} props={props} ctx={ctx} />;
}
