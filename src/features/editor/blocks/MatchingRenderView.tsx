import { renderMatching } from "../../../core/blocks/matching/render.js";
import type { MatchingRenderContext, MatchingRenderProps } from "../../../core/blocks/matching/render.js";
import { useAssetStore } from "../../../core/assets/assetStore";
import { matchingItemText } from "../../../core/document/translations";
import { withProgress } from "../../../core/document/variablePlaceholders";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { MatchItem, MatchingBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import { RenderHost } from "./RenderHost";

/**
 * A matching as it is drawn in the thumbnails and the PDF: by the function the player draws it with (blocks/matching/render.js), as the cards where they
 * stand and the button. Nothing here can be used. (On the canvas the cards are moved, their words written in place and their pictures changed:
 * MatchingCanvas, which draws with MatchingView.)
 */
export function MatchingRenderView({ block, lang, defaultLang, mode, progress }: { block: MatchingBlock; lang: string | null; defaultLang: string | null; mode: MatchingRenderContext["mode"]; progress?: number | null }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const card = (item: MatchItem) => ({
    id: item.id,
    kind: item.kind,
    text: item.kind === "image" ? matchingItemText(block, item, lang, defaultLang) : withProgress(matchingItemText(block, item, lang, defaultLang), progress),
    src: item.kind === "image" && item.assetId ? (getObjectUrl(item.assetId) ?? "") : "",
    x: item.x,
    y: item.y,
  });
  const props: MatchingRenderProps = {
    id: block.id,
    sources: block.sources.map(card),
    targets: block.targets.map(card),
    pairs: block.pairs,
    sourceSize: block.sourceSize,
    targetSize: block.targetSize,
  };
  const ctx: MatchingRenderContext = {
    mode,
    text: (key) => strings[key] ?? "",
    icons: { submit: acceptSvg, correct: "", incorrect: "" },
    fill: () => {},
    submit: () => {},
    announce: () => {},
    enlarge: () => {},
  };
  return <RenderHost render={renderMatching} props={props} ctx={ctx} />;
}
