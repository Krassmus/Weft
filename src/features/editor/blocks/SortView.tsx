import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, MutableRefObject, PointerEvent as ReactPointerEvent, Ref } from "react";
import { useAssetStore } from "../../../core/assets/assetStore";
import { sortItemBox, sortLayout } from "../../../core/document/sortLayout";
import { sortItemText, sortLabel } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { tr } from "../../../core/i18n/tr";
import { BlockKindIcon } from "../BlockKindIcon";
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
  onItemDoubleClick,
  editing,
  onAddText,
  onAddImage,
  rootRef,
}: {
  block: SortBlock;
  lang: string | null;
  defaultLang: string | null;
  /** The ids of the objects in the order to show them in, while one is being dragged (else the block's own). */
  order?: string[] | null;
  /** The object that is held: it leaves the silhouette of itself where it would be put (the one that follows the pointer is SortCanvas's). */
  grabbed?: string | null;
  /** Given on the canvas of a selected block: the pointer goes down on an object (to move it). */
  onItemPointerDown?: (event: ReactPointerEvent, item: SortItem) => void;
  /** Given on the canvas of a selected block: a double click on an object (to write its text in place, or to choose another picture). */
  onItemDoubleClick?: (item: SortItem) => void;
  /** The text being written in place: that of the object `id`, which is shown as a field instead. */
  editing?: { id: string; value: string; onChange: (value: string) => void; onCommit: () => void; onCancel: () => void } | null;
  /** Given on the canvas of a selected block: the buttons at the arrow's end that add a text / a picture as the last object. */
  onAddText?: () => void;
  onAddImage?: () => void;
  rootRef?: Ref<HTMLDivElement>;
}) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const vertical = block.orientation !== "horizontal";
  const layout = sortLayout(block);
  const multi = layout.lines > 1;
  const root = useRef<HTMLDivElement | null>(null);
  const setRoot = (el: HTMLDivElement | null) => {
    root.current = el;
    if (typeof rootRef === "function") rootRef(el);
    else if (rootRef) (rootRef as MutableRefObject<HTMLDivElement | null>).current = el;
  };
  const start = sortLabel(block, "start", lang, defaultLang);
  const end = sortLabel(block, "end", lang, defaultLang);
  // Under a horizontal line the words stand just under the lowest of the objects (a picture: of its frame, which can be smaller than the room the
  // object takes): measured, again when the line's size or a picture's shape changes (the player does the same).
  const sizeKey = `${block.itemSize.width}x${block.itemSize.height}:${block.items.length}`;
  const { lines, per } = layout;
  useLayoutEffect(() => {
    const el = root.current;
    const body = el?.querySelector<HTMLElement>(".weft-sort-body");
    const list = el?.querySelector<HTMLElement>(".weft-sort-list");
    const bar = el?.querySelector<HTMLElement>(".weft-sort-bar");
    if (!el || !body || !list || vertical) return;
    let frame = 0;
    const place = () => {
      const top = body.getBoundingClientRect().top;
      let lowest = 0;
      let lowestFirst = 0; // (under several rows: the first row's words stand under the first row, the last row's under the last)
      Array.from(list.children).forEach((card, i) => {
        const rect = (card.querySelector(".weft-matching-frame") ?? card).getBoundingClientRect();
        if (rect.height <= 0) return;
        const bottom = rect.bottom - top;
        if (Math.floor(i / per) === 0) lowestFirst = Math.max(lowestFirst, bottom);
        if (Math.floor(i / per) === lines - 1) lowest = Math.max(lowest, bottom);
      });
      if (lowest <= 0) return;
      body.style.setProperty("--sort-labels-top", `${Math.round(lowest)}px`);
      if (lowestFirst > 0) body.style.setProperty("--sort-start-top", `${Math.round(lowestFirst)}px`);
      // The button moves up under the objects and their words (a shift, not a change of the room), so that it belongs to the line.
      let used = lowest;
      for (const label of Array.from(body.querySelectorAll<HTMLElement>(":scope > .weft-sort-end"))) used = Math.max(used, label.getBoundingClientRect().bottom - top);
      const free = body.getBoundingClientRect().height - used;
      if (bar) bar.style.transform = free > 0 ? `translateY(${-Math.round(free)}px)` : "";
    };
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(soon) : null;
    observer?.observe(list);
    el.addEventListener("load", soon, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      el.removeEventListener("load", soon, true);
    };
  }, [vertical, sizeKey, lines, per, start, end]);
  return (
    <div ref={setRoot} style={{ "--sort-item-h": block.itemSize.height, "--sort-lines": lines, "--sort-per": per } as CSSProperties} className={"weft-sort weft-sort-view " + (vertical ? "is-vertical" : "is-horizontal") + (multi ? " is-multi" : "") + (start !== "" ? " has-start" : "") + (end !== "" ? " has-end" : "")}>
      <div className="weft-sort-body">
        {start !== "" && <span className="weft-sort-end is-start">{start}</span>}
        {multi && (
          <div className="weft-sort-lanes" aria-hidden="true">
            {Array.from({ length: lines }, (_, lane) => (
              <span key={lane} className="weft-sort-lane" />
            ))}
          </div>
        )}
        <div className="weft-sort-list">
          {(order ? order.map((id) => block.items.find((item) => item.id === id)).filter((item): item is SortItem => !!item) : block.items).map((item) => {
            const src = item.kind === "image" && item.assetId ? getObjectUrl(item.assetId) : undefined;
            const itemBox = sortItemBox(block, layout, item.kind === "image");
            return (
              <div
                key={item.id}
                data-weft-item={item.id}
                className={"weft-sort-item" + (item.kind === "image" ? " is-image" : "") + (grabbed === item.id ? " is-dragging" : "") + (onItemPointerDown ? " is-movable" : "")}
                onPointerDown={onItemPointerDown ? (e) => onItemPointerDown(e, item) : undefined}
                onDoubleClick={onItemDoubleClick ? () => onItemDoubleClick(item) : undefined}
                style={{ width: `${itemBox.width}%`, height: `${itemBox.height}%` }}
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
                ) : editing && editing.id === item.id ? (
                  <input
                    className="weft-sort-edit"
                    value={editing.value}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => editing.onChange(e.target.value)}
                    onBlur={editing.onCommit}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") editing.onCommit();
                      else if (e.key === "Escape") editing.onCancel();
                    }}
                  />
                ) : (
                  <span className="weft-sort-text">{sortItemText(block, item, lang, defaultLang)}</span>
                )}
              </div>
            );
          })}
        </div>
        {end !== "" && <span className="weft-sort-end is-end">{end}</span>}
        {(onAddText || onAddImage) && (
          <div className="weft-sort-add" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            {onAddText && (
              <button type="button" className="weft-sort-add-button" title={tr("ui.sort_add_text")} aria-label={tr("ui.sort_add_text")} onClick={onAddText}>
                <span aria-hidden="true">+</span>
                <BlockKindIcon kind="text" size={13} />
              </button>
            )}
            {onAddImage && (
              <button type="button" className="weft-sort-add-button" title={tr("ui.sort_add_image")} aria-label={tr("ui.sort_add_image")} onClick={onAddImage}>
                <span aria-hidden="true">+</span>
                <BlockKindIcon kind="image" size={13} />
              </button>
            )}
          </div>
        )}
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
