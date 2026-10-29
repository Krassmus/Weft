import { useLayoutEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useAssetStore } from "../../../core/assets/assetStore";
import { matchingItemText } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { MatchItem, MatchingBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";

/** The place of a card while it is being dragged on the canvas (percent of the area): it is written into the block when the pointer is let go. */
export type MatchingDrag = { id: string; x: number; y: number };

/** The words of a card being written in place (a double click on the canvas of a selected block): a field as high as its text. */
export type MatchingEditing = { id: string; value: string; onChange: (value: string) => void; onCommit: () => void; onCancel: () => void };

function MatchingTextField({ editing }: { editing: MatchingEditing }) {
  const field = useRef<HTMLTextAreaElement>(null);
  // As high as its text - again when the block is scaled (the text then changes its size and where it breaks its lines).
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [editing.value]);
  return (
    <textarea
      ref={field}
      className="weft-matching-edit"
      rows={1}
      value={editing.value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => editing.onChange(e.target.value)}
      onBlur={editing.onCommit}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        // (Enter keeps the words; a line break is Shift+Enter.)
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          editing.onCommit();
        } else if (e.key === "Escape") editing.onCancel();
      }}
    />
  );
}

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
  onCardDoubleClick,
  editing,
}: {
  block: MatchingBlock;
  lang: string | null;
  defaultLang: string | null;
  drag?: MatchingDrag | null;
  /** Given on the canvas of a selected block: the pointer goes down on a card (to move it). */
  onCardPointerDown?: (event: ReactPointerEvent, item: MatchItem, side: "source" | "target") => void;
  /** Given on the canvas of a selected block: a double click on a card (to write its text in place, or to choose another picture). */
  onCardDoubleClick?: (item: MatchItem) => void;
  /** The text being written in place: that of the card `id`, which is shown as a field instead. */
  editing?: MatchingEditing | null;
}) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const card = (item: MatchItem, side: "source" | "target") => {
    const size = side === "source" ? block.sourceSize : block.targetSize;
    const place = drag && drag.id === item.id ? drag : item;
    const src = item.kind === "image" && item.assetId ? getObjectUrl(item.assetId) : undefined;
    const content =
      item.kind === "image" ? (
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
      ) : editing && editing.id === item.id ? (
        <MatchingTextField editing={editing} />
      ) : (
        <span className="weft-matching-text">{matchingItemText(block, item, lang, defaultLang)}</span>
      );
    return (
      <div
        key={item.id}
        className={"weft-matching-card weft-matching-" + side + (item.kind === "image" ? " is-image" : "") + (drag?.id === item.id ? " is-dragged" : "") + (onCardPointerDown ? " is-movable" : "")}
        style={{ left: `${place.x}%`, top: `${place.y}%`, width: `${size.width}%`, height: `${size.height}%` }}
        onPointerDown={onCardPointerDown ? (e) => onCardPointerDown(e, item, side) : undefined}
        onDoubleClick={onCardDoubleClick ? () => onCardDoubleClick(item) : undefined}
      >
        {side === "target" ? (
          // (A target is made as the player makes it: its words or picture in a body, and the dock where the cards put on it would stand.)
          <>
            <span className="weft-matching-body">{content}</span>
            <span className="weft-matching-dock" />
          </>
        ) : (
          content
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
