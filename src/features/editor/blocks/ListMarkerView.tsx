import { useAssetStore } from "../../../core/assets/assetStore";
import type { ListBlock } from "../../../core/types";

/** The mark in front of item number `index` (from 0) of a list - what the player draws too (see renderListBlock in
 * player.runtime.js; kept in step by hand): a dot, a dash, the number, or the author's own picture. */
export function ListMarkerView({ block, index }: { block: ListBlock; index: number }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  if (block.marker === "image") {
    const src = block.markerAssetId ? getObjectUrl(block.markerAssetId) : undefined;
    const size = block.markerSize ?? DEFAULT_MARKER_SIZE;
    // Centred on the middle of the lower case letters (0.32em above the baseline).
    const style = { height: `${size}em`, verticalAlign: `${(0.32 - size / 2).toFixed(3)}em` };
    return (
      <span className="weft-list-marker is-image">
        {src ? <img src={src} alt="" draggable={false} style={style} /> : <span className="weft-list-marker-empty" style={style} />}
      </span>
    );
  }
  // A dot and a dash are drawn by the stylesheet (see .weft-list-marker.is-dot); only a number is text.
  return <span className={"weft-list-marker is-" + block.marker}>{block.marker === "number" ? `${index + 1}.` : ""}</span>;
}

/** The height of the picture of an image mark in em, when the list has no setting of its own. */
export const DEFAULT_MARKER_SIZE = 1.2;
