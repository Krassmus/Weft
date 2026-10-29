import { useMemo } from "react";
import { renderTex } from "../../../core/blocks/tex/render.js";
import type { TexRenderContext, TexRenderProps } from "../../../core/blocks/tex/render.js";
import { tr } from "../../../core/i18n/tr";
import { renderTexToHtml } from "../../../core/tex/renderTex";
import type { TexBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A formula as it is drawn on the canvas, in the thumbnails and in the PDF: by the function the player draws it with (blocks/tex/render.js), typeset here
 * by the function the page is built with. It is scaled to fit the block's box, so resizing the block resizes the formula. (It is edited in a dialog.)
 */
export function TexRenderView({ block, mode }: { block: TexBlock; mode: TexRenderContext["mode"] }) {
  const html = useMemo(() => (block.tex.trim() ? renderTexToHtml(block.tex) : ""), [block.tex]);
  const props: TexRenderProps = { html, color: block.color || "" };
  return <RenderHost render={renderTex} props={props} ctx={{ mode, text: () => tr("ui.enter_formula") }} />;
}
