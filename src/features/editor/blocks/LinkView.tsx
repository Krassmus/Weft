import { renderLink } from "../../../core/blocks/link/render.js";
import type { LinkRenderContext, LinkRenderProps } from "../../../core/blocks/link/render.js";
import { safeLinkUrl } from "../../../core/document/linkUrl";
import { fieldWording } from "../../../core/document/translations";
import { linkIconSvg } from "../../../core/runtime/linkIcons.js";
import type { LinkBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A link as it is drawn - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/link/render.js). A picture of a
 * link, not clickable here; in the PDF the address is a link where it stands.
 */
export function LinkView({ block, lang, defaultLang, mode }: { block: LinkBlock; lang: string | null; defaultLang: string | null; mode: LinkRenderContext["mode"] }) {
  const props: LinkRenderProps = { href: safeLinkUrl(block.url) ?? "", label: fieldWording(block, "text", lang, defaultLang).trim() };
  const ctx: LinkRenderContext = { mode, icon: linkIconSvg() };
  return <RenderHost render={renderLink} props={props} ctx={ctx} />;
}
