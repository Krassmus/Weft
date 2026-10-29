import { renderRevealer } from "../../../core/blocks/revealer/render.js";
import type { RevealerRenderContext, RevealerRenderProps } from "../../../core/blocks/revealer/render.js";
import { useAssetStore } from "../../../core/assets/assetStore";
import { useDocumentStore } from "../../../core/document/store";
import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { revealerWording } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { revealerIconSvg, revealerSignColor } from "../../../core/runtime/revealerGeometry.js";
import type { RevealerBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A revealer as it is drawn - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/revealer/render.js), as the icon -
 * and, on the canvas while the block is selected (`open`), the window standing open around it, so that what is written in its panel can be seen where it
 * stands. Nothing here can be used.
 */
export function RevealerView({ block, lang, defaultLang, mode, open }: { block: RevealerBlock; lang: string | null; defaultLang: string | null; mode: RevealerRenderContext["mode"]; open?: boolean }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const words = revealerWording(block, lang, defaultLang);
  const props: RevealerRenderProps = {
    id: block.id,
    size: Math.min(block.position.width, block.position.height / slideAspect),
    x: block.position.x,
    iconSvg: revealerIconSvg(block.icon, block.color),
    signColor: revealerSignColor(block.color),
    color: block.color,
    title: words.title,
    body: words.body,
    imageSrc: block.imageAssetId ? (getObjectUrl(block.imageAssetId) ?? null) : null,
    imageAlt: words.imageAlt,
    windowStyle: block.windowStyle === "light" ? "light" : "dark",
    button: block.button ? { text: words.buttonText } : null,
    open: !!open,
  };
  const ctx: RevealerRenderContext = { mode, text: (key) => strings[key] ?? "", opened: () => {}, announce: () => {} };
  return <RenderHost render={renderRevealer} props={props} ctx={ctx} />;
}
