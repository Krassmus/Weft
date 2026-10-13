import { useAssetStore } from "../../../core/assets/assetStore";
import type { ListBlock } from "../../../core/types";

/** The mark in front of item number `index` (from 0) of a list - what the player draws too (see renderListBlock in
 * player.runtime.js; kept in step by hand): a dot, a dash, the number, or the author's own picture. */
export function ListMarkerView({ block, index }: { block: ListBlock; index: number }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  if (block.marker === "image") {
    const src = block.markerAssetId ? getObjectUrl(block.markerAssetId) : undefined;
    return <span className="weft-list-marker is-image">{src ? <img src={src} alt="" draggable={false} /> : <span className="weft-list-marker-empty" />}</span>;
  }
  const glyph = block.marker === "dash" ? "–" : block.marker === "number" ? `${index + 1}.` : "•";
  return <span className={"weft-list-marker is-" + block.marker}>{glyph}</span>;
}
