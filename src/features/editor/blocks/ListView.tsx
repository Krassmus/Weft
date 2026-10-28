import { renderList } from "../../../core/blocks/list/render.js";
import type { ListRenderContext, ListRenderProps } from "../../../core/blocks/list/render.js";
import { useAssetStore } from "../../../core/assets/assetStore";
import { listItemHtml } from "../../../core/document/translations";
import { withProgress } from "../../../core/document/variablePlaceholders";
import type { ListBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";

/**
 * A list as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/list/render.js). (On the canvas the points are
 * written in place: ListBlockCanvas in BlockView.tsx.)
 */
export function ListView({ block, lang, defaultLang, mode, progress }: { block: ListBlock; lang: string | null; defaultLang: string | null; mode: ListRenderContext["mode"]; progress?: number | null }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const props: ListRenderProps = {
    items: block.items.map((item) => ({ id: item.id, html: withProgress(listItemHtml(block, item.id, lang, defaultLang), progress) })),
    marker: block.marker,
    markerColor: block.markerColor,
    markerSrc: block.markerAssetId ? (getObjectUrl(block.markerAssetId) ?? null) : null,
    markerSize: block.markerSize,
    spacing: block.spacing,
  };
  return <RenderHost render={renderList} props={props} ctx={{ mode }} />;
}
