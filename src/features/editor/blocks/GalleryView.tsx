import { useAssetStore } from "../../../core/assets/assetStore";
import { tr } from "../../../core/i18n/tr";
import type { GalleryBlock } from "../../../core/types";
import { BlockKindIcon } from "../BlockKindIcon";

/** The pictures of a gallery that are shown: those that have a file (the player leaves out the others, too). */
export function galleryShown(block: GalleryBlock) {
  return block.items.filter((item) => item.assetId);
}

const CHEVRON_PREV = "M15 5l-7 7 7 7";
const CHEVRON_NEXT = "M9 5l7 7-7 7";

function Chevron({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A gallery as it is drawn - the canvas and the thumbnails. The markup and the class names are those the player makes (renderGalleryBlock in
 * player.runtime.js): a track of slides in a viewport, an arrow to each side and a dot for every picture. `index` is the picture shown; the arrows
 * and dots only do something where `onIndex` is given (the canvas of a selected block) - in a thumbnail they are a picture of what the learner sees.
 */
export function GalleryView({ block, index = 0, onIndex }: { block: GalleryBlock; index?: number; onIndex?: (index: number) => void }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const items = galleryShown(block);
  if (items.length === 0) {
    return (
      <div className="weft-gallery-empty">
        <BlockKindIcon kind="gallery" />
        <span>{tr("ui.gallery")}</span>
      </div>
    );
  }
  const current = Math.max(0, Math.min(items.length - 1, index));
  const go = (to: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onIndex?.(Math.max(0, Math.min(items.length - 1, to)));
  };
  const stop = onIndex ? (e: React.SyntheticEvent) => e.stopPropagation() : undefined;
  return (
    <div className={"weft-gallery" + (block.fit === "contain" ? " is-contain" : "") + (onIndex ? " is-browsable" : "")}>
      <div className="weft-gallery-viewport">
        <div className="weft-gallery-track" style={{ transform: `translateX(${-current * 100}%)` }}>
          {items.map((item) => {
            const src = item.assetId ? getObjectUrl(item.assetId) : undefined;
            return (
              <div key={item.id} className="weft-gallery-slide">
                {src && <img className="weft-gallery-image" src={src} alt="" draggable={false} />}
              </div>
            );
          })}
        </div>
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="weft-gallery-arrow is-prev" aria-label={tr("ui.gallery_previous")} disabled={current === 0} onPointerDown={stop} onDoubleClick={stop} onClick={onIndex ? go(current - 1) : undefined} tabIndex={onIndex ? 0 : -1}>
            <Chevron d={CHEVRON_PREV} />
          </button>
          <button type="button" className="weft-gallery-arrow is-next" aria-label={tr("ui.gallery_next")} disabled={current === items.length - 1} onPointerDown={stop} onDoubleClick={stop} onClick={onIndex ? go(current + 1) : undefined} tabIndex={onIndex ? 0 : -1}>
            <Chevron d={CHEVRON_NEXT} />
          </button>
          <div className="weft-gallery-dots">
            {items.map((item, i) => (
              <button key={item.id} type="button" className={"weft-gallery-dot" + (i === current ? " is-current" : "")} aria-label={String(i + 1)} onPointerDown={stop} onDoubleClick={stop} onClick={onIndex ? go(i) : undefined} tabIndex={onIndex ? 0 : -1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
