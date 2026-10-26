import type { PointerEvent as ReactPointerEvent } from "react";
import { useAssetStore } from "../../../core/assets/assetStore";
import { sortItemText, sortLabel } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { SortBlock, SortItem } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";

/**
 * A sorting puzzle as it is drawn - the canvas and the thumbnails. The markup and the class names are those the player makes (renderSortBlock in
 * player.runtime.js): the objects on their line - here in the RIGHT order, the way the author entered them; the learner sees them mixed up -, the
 * words of the line's two ends and, under them, the button. The learner's part - putting them in order - is the player's; on the canvas of a
 * selected block the author can put them in the right order by dragging (SortCanvas, which gives `order`, `grabbed` and `onItemPointerDown`).
 */
export function SortView({
  block,
  lang,
  defaultLang,
  order,
  grabbed,
  onItemPointerDown,
}: {
  block: SortBlock;
  lang: string | null;
  defaultLang: string | null;
  /** The ids of the objects in the order to show them in, while one is being dragged (else the block's own). */
  order?: string[] | null;
  /** The object that is held. */
  grabbed?: string | null;
  /** Given on the canvas of a selected block: the pointer goes down on an object (to move it). */
  onItemPointerDown?: (event: ReactPointerEvent, item: SortItem) => void;
}) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const vertical = block.orientation !== "horizontal";
  const start = sortLabel(block, "start", lang, defaultLang);
  const end = sortLabel(block, "end", lang, defaultLang);
  return (
    <div className={"weft-sort weft-sort-view " + (vertical ? "is-vertical" : "is-horizontal")}>
      <div className="weft-sort-body">
        {start !== "" && <span className="weft-sort-end is-start">{start}</span>}
        <div className="weft-sort-list">
          {(order ? order.map((id) => block.items.find((item) => item.id === id)).filter((item): item is SortItem => !!item) : block.items).map((item) => {
            const src = item.kind === "image" && item.assetId ? getObjectUrl(item.assetId) : undefined;
            return (
              <div
                key={item.id}
                data-weft-item={item.id}
                className={"weft-sort-item" + (item.kind === "image" ? " is-image" : "") + (grabbed === item.id ? " is-grabbed" : "") + (onItemPointerDown ? " is-movable" : "")}
                onPointerDown={onItemPointerDown ? (e) => onItemPointerDown(e, item) : undefined}
                style={{ width: `${block.itemSize.width}%`, height: `${block.itemSize.height}%` }}
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
                  <span className="weft-sort-text">{sortItemText(block, item, lang, defaultLang)}</span>
                )}
              </div>
            );
          })}
        </div>
        {end !== "" && <span className="weft-sort-end is-end">{end}</span>}
      </div>
      <div className="weft-sort-bar">
        <div className="weft-thumb-block-quiz-submit">
          <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
          {playerStringsFor(lang).submit}
        </div>
      </div>
    </div>
  );
}
