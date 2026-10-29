import { renderSort } from "../../../core/blocks/sort/render.js";
import type { SortRenderContext, SortRenderProps } from "../../../core/blocks/sort/render.js";
import { useAssetStore } from "../../../core/assets/assetStore";
import { sortItemText, sortLabel } from "../../../core/document/translations";
import { withProgress } from "../../../core/document/variablePlaceholders";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { SortBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import { RenderHost } from "./RenderHost";

/**
 * A sorting puzzle as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/sort/render.js), as the objects on their
 * line in the RIGHT order - the way the author entered them; the learner sees them mixed up - the words at the line's ends and the button. Nothing here can
 * be used. (On the canvas the objects are put in order by dragging, their words written in place and their pictures changed: SortCanvas, which draws with
 * SortView.)
 */
export function SortRenderView({ block, lang, defaultLang, mode, progress }: { block: SortBlock; lang: string | null; defaultLang: string | null; mode: SortRenderContext["mode"]; progress?: number | null }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: SortRenderProps = {
    id: block.id,
    items: block.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      text: item.kind === "image" ? sortItemText(block, item, lang, defaultLang) : withProgress(sortItemText(block, item, lang, defaultLang), progress),
      src: item.kind === "image" && item.assetId ? (getObjectUrl(item.assetId) ?? "") : "",
    })),
    orientation: block.orientation,
    itemSize: block.itemSize,
    startLabel: withProgress(sortLabel(block, "start", lang, defaultLang), progress),
    endLabel: withProgress(sortLabel(block, "end", lang, defaultLang), progress),
  };
  const ctx: SortRenderContext = {
    mode,
    text: (key) => strings[key] ?? "",
    textWith: (key, values) => (strings[key] ?? "").replace(/\{(\w+)\}/g, (all, name: string) => (values[name] !== undefined ? String(values[name]) : all)),
    icons: { submit: acceptSvg, correct: "", incorrect: "" },
    fill: () => {},
    submit: () => {},
    announce: () => {},
    enlarge: () => {},
  };
  return <RenderHost render={renderSort} props={props} ctx={ctx} />;
}
