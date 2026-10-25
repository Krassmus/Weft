import type { PointerEvent as ReactPointerEvent } from "react";
import { useAssetStore } from "../../../core/assets/assetStore";
import { matchingItemText } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { MatchItem, MatchingBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";

/** The place of a card while it is being dragged on the canvas (percent of the area): it is written into the block when the pointer is let go. */
export type MatchingDrag = { id: string; x: number; y: number };

/**
 * A matching as it is drawn - the canvas, where the cards can be moved, and the thumbnails. The markup and the class names are those the player
 * makes (renderMatchingBlock in player.runtime.js): the area with the cards of both lists at their places and, under it, the button. Nothing here
 * is a drop target: the learner's part is the player's.
 */
export function MatchingView({
  block,
  lang,
  defaultLang,
  drag,
  onCardPointerDown,
}: {
  block: MatchingBlock;
  lang: string | null;
  defaultLang: string | null;
  drag?: MatchingDrag | null;
  /** Given on the canvas of a selected block: the pointer goes down on a card (to move it). */
  onCardPointerDown?: (event: ReactPointerEvent, item: MatchItem, side: "source" | "target") => void;
}) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const card = (item: MatchItem, side: "source" | "target") => {
    const size = side === "source" ? block.sourceSize : block.targetSize;
    const place = drag && drag.id === item.id ? drag : item;
    const src = item.kind === "image" && item.assetId ? getObjectUrl(item.assetId) : undefined;
    return (
      <div
        key={item.id}
        className={"weft-matching-card weft-matching-" + side + (item.kind === "image" ? " is-image" : "") + (drag?.id === item.id ? " is-dragged" : "") + (onCardPointerDown ? " is-movable" : "")}
        style={{ left: `${place.x}%`, top: `${place.y}%`, width: `${size.width}%`, height: `${size.height}%` }}
        onPointerDown={onCardPointerDown ? (e) => onCardPointerDown(e, item, side) : undefined}
      >
        {item.kind === "image" ? (
          <span className="weft-matching-pic">
            <span className="weft-matching-frame">
              {src ? (
                <img
                  className="weft-matching-image"
                  src={src}
                  alt=""
                  draggable={false}
                  onLoad={(e) => {
                    const image = e.currentTarget;
                    if (image.naturalWidth && image.naturalHeight) image.parentElement?.style.setProperty("--ratio", String(image.naturalWidth / image.naturalHeight));
                  }}
                />
              ) : (
                <span className="weft-matching-empty" />
              )}
            </span>
          </span>
        ) : (
          <span className="weft-matching-text">{matchingItemText(block, item, lang, defaultLang)}</span>
        )}
      </div>
    );
  };
  return (
    <div className="weft-matching weft-matching-view">
      <div className="weft-matching-area">
        {block.targets.map((item) => card(item, "target"))}
        {block.sources.map((item) => card(item, "source"))}
      </div>
      <div className="weft-matching-bar">
        <div className="weft-thumb-block-quiz-submit">
          <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
          {playerStringsFor(lang).submit}
        </div>
      </div>
    </div>
  );
}
