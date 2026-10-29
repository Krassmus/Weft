import { useMemo } from "react";
import { renderCode } from "../../../core/blocks/code/render.js";
import type { CodeRenderContext, CodeRenderProps } from "../../../core/blocks/code/render.js";
import { CODE_THEMES, DEFAULT_CODE_THEME } from "../../../core/code/codeThemes";
import { highlightCodeToHtml } from "../../../core/code/highlight";
import { tr } from "../../../core/i18n/tr";
import type { CodeBlock } from "../../../core/types";
import { ensureThemeStyles } from "./CodeView";
import { RenderHost } from "./RenderHost";

/**
 * A code block as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/code/render.js), with the code highlighted
 * here by the function the page is built with. Nothing here can be used. (On the canvas the code is typed straight into the block: CodeView.)
 */
export function CodeRenderView({ block, mode }: { block: CodeBlock; mode: CodeRenderContext["mode"] }) {
  ensureThemeStyles();
  const html = useMemo(() => highlightCodeToHtml(block.code, block.language), [block.code, block.language]);
  const props: CodeRenderProps = {
    html,
    // (A theme that is not known is the default one, as in the editor everywhere.)
    theme: CODE_THEMES.some((theme) => theme.id === block.theme) ? block.theme : DEFAULT_CODE_THEME,
    fontSize: block.fontSize,
    transparentBackground: !!block.transparentBackground,
  };
  return <RenderHost render={renderCode} props={props} ctx={{ mode, text: () => tr("ui.enter_code") }} />;
}
