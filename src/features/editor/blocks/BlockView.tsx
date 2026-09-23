import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import QRCode from "qrcode";
// A generic "this is a video" indicator for the (non-interactive, see below) editor canvas -
// deliberately not play.svg, which would look clickable even though clicking does nothing here;
// see player.runtime.js/.css for the real, playable preview/export instead.
import video2IconSvg from "../../../../mockups/icons/video2.svg?raw";
import { useAssetStore } from "../../../core/assets/assetStore";
import type { Block, BlockPosition, IframeBlock, TextBlock } from "../../../core/types";
import { registerActiveEditable, saveSelection } from "./richText";
import type { CornerHandleId, HandleId } from "./resizeMath";
import { clampMove, CORNER_HANDLES, distanceToEdge, HANDLES, resizeCornerLocked, resizeFromHandle, unrotateDelta } from "./resizeMath";

const EDGE_GRAB_PX = 5;
const DRAG_THRESHOLD_PX = 3;

const RESIZE_CURSORS: Record<HandleId, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

interface BlockViewProps {
  block: Block;
  selected: boolean;
  locked: boolean;
  onSelect?: () => void;
  onUpdate?: (patch: Partial<Block>) => void;
}

export function BlockView({ block, selected, locked, onSelect, onUpdate }: BlockViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [liveOverride, setLiveOverride] = useState<BlockPosition | null>(null);
  const [nearEdge, setNearEdge] = useState(false);
  const position = liveOverride ?? block.position;
  // An image, video, or iframe has no inner content worth preserving access to on the canvas
  // (unlike text/quiz - and an iframe's own content is non-interactive here anyway, see
  // .weft-edit-block-iframe-wrap iframe's pointer-events:none in App.css), so it can be grabbed
  // and moved from anywhere - including on the very first click, before it's even selected, see
  // handlePointerDownMove/handlePointerMoveHover below.
  const isFreelyMovableBlock = block.kind === "image" || block.kind === "video" || block.kind === "iframe";
  // Only an image or video has a "natural" width/height ratio worth protecting from a stretch -
  // an embedded page (iframe) is expected to be responsive and reflow at whatever size it's
  // given, so unlike image/video it keeps the full edge+corner handle set below instead of being
  // limited to proportional corner-only resizing.
  const usesProportionalResize = block.kind === "image" || block.kind === "video";

  const style: CSSProperties = {
    position: "absolute",
    left: `${position.x}%`,
    top: `${position.y}%`,
    width: `${position.width}%`,
    height: `${position.height}%`,
    transform: position.rotation ? `rotate(${position.rotation}deg)` : undefined,
  };

  function stageRect(): DOMRect | null {
    return wrapRef.current?.parentElement?.getBoundingClientRect() ?? null;
  }

  // EDGE_GRAB_PX is an absolute pixel distance, so for a block that isn't very tall (a lot of
  // text blocks - a single line is often well under 16px tall), it alone would classify the
  // entire block as "near an edge", leaving no interior to select text (or click into an
  // iframe/quiz) from at all. Capping it at a fraction of the block's own size guarantees a real
  // interior for any reasonably-sized block, while leaving it unchanged for normal-sized ones.
  function edgeThreshold(rect: DOMRect): number {
    return Math.min(EDGE_GRAB_PX, rect.width * 0.15, rect.height * 0.15);
  }

  function handlePointerDownMove(e: ReactPointerEvent) {
    if (locked) return;
    // A freely-movable block can start a drag from the very first pointerdown, even before it's
    // selected - handleMove below selects it as soon as the drag threshold is crossed. Any other
    // kind still needs a prior click to select it first, since only then does clicking near its
    // edge (rather than its interior, reserved for text selection/interacting with the block)
    // mean "move", not "select".
    if (!selected && !isFreelyMovableBlock) return;
    if (!isFreelyMovableBlock) {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || distanceToEdge(e.clientX, e.clientY, rect) > edgeThreshold(rect)) return;
    }

    // Suppress native text/image drag-selection now, at pointerdown - by the time a pointermove
    // notices the drag threshold was crossed, the browser has already started its own selection.
    e.preventDefault();
    e.stopPropagation();
    const startPosition = block.position;
    const stage = stageRect();
    if (!stage) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let started = false;
    let committed = startPosition;

    function handleMove(ev: PointerEvent) {
      if (!started) {
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < DRAG_THRESHOLD_PX) return;
        started = true;
        onSelect?.();
        document.body.classList.add("weft-dragging");
      }
      ev.preventDefault();
      const dxPercent = ((ev.clientX - startClientX) / stage!.width) * 100;
      const dyPercent = ((ev.clientY - startClientY) / stage!.height) * 100;
      committed = clampMove(startPosition, dxPercent, dyPercent);
      setLiveOverride(committed);
    }

    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      if (started) onUpdate?.({ position: committed });
      setLiveOverride(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function handlePointerMoveHover(e: ReactPointerEvent) {
    if (locked) return;
    if (!selected && !isFreelyMovableBlock) return;
    if (isFreelyMovableBlock) {
      setNearEdge(true);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setNearEdge(distanceToEdge(e.clientX, e.clientY, rect) <= edgeThreshold(rect));
  }

  function handleResizeStart(handle: HandleId, e: ReactPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startPosition = block.position;
    const stage = stageRect();
    if (!stage) return;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let committed = startPosition;

    function handleMove(ev: PointerEvent) {
      ev.preventDefault();
      // The handle itself is dragged in plain screen space, but a rotated block's own width/
      // height axes aren't aligned with the screen anymore - un-rotate the raw pixel delta first
      // so e.g. dragging straight down on a block rotated 90° still reads as "along its local x
      // axis", matching whichever edge visually moved under the cursor (see unrotateDelta).
      const { dx, dy } = unrotateDelta(ev.clientX - startClientX, ev.clientY - startClientY, startPosition.rotation ?? 0);
      const dxPercent = (dx / stage!.width) * 100;
      const dyPercent = (dy / stage!.height) * 100;
      committed = usesProportionalResize
        ? resizeCornerLocked(handle as CornerHandleId, startPosition, stage!, dxPercent, dyPercent)
        : resizeFromHandle(handle, startPosition, stage!, dxPercent, dyPercent);
      setLiveOverride(committed);
    }

    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      document.body.style.cursor = "";
      onUpdate?.({ position: committed });
      setLiveOverride(null);
    }

    // Fix the cursor to this handle's resize direction for the whole drag - otherwise a fast
    // pointer move off the (8px) handle would fall back to the default arrow mid-drag.
    document.body.style.cursor = RESIZE_CURSORS[handle];
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <div
      ref={wrapRef}
      className={
        "weft-edit-block" +
        (selected ? " is-selected" : "") +
        (locked ? " is-locked" : "") +
        (nearEdge ? " is-near-edge" : "")
      }
      style={style}
      onClick={(event) => {
        if (locked) return;
        event.stopPropagation();
        onSelect?.();
      }}
      onPointerDown={handlePointerDownMove}
      onPointerMove={handlePointerMoveHover}
      onPointerLeave={() => setNearEdge(false)}
    >
      <div className="weft-edit-block-inner">
        <BlockContent block={block} selected={selected} onUpdate={onUpdate} />
      </div>
      {selected &&
        !locked &&
        (usesProportionalResize ? CORNER_HANDLES : HANDLES).map((h) => (
          <div
            key={h.id}
            className={`weft-resize-handle weft-resize-handle-${h.id}`}
            onPointerDown={(e) => handleResizeStart(h.id, e)}
          />
        ))}
    </div>
  );
}

function BlockContent({
  block,
  selected,
  onUpdate,
}: {
  block: Block;
  selected: boolean;
  onUpdate?: (patch: Partial<Block>) => void;
}) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);

  switch (block.kind) {
    case "text":
      return <EditableText block={block} selected={selected} onUpdate={onUpdate} />;
    case "image":
      return block.assetId ? (
        <img src={getObjectUrl(block.assetId)} alt={block.alt} className="weft-edit-block-image" draggable={false} />
      ) : (
        <div className="weft-edit-block-placeholder">Bild wählen …</div>
      );
    case "video":
      // No native controls here, regardless of the block's own setting: pointer-events: none
      // (see App.css) already keeps them unusable, so showing them (and the "big play button"
      // browsers draw over a paused, controllable video) would only look clickable without being
      // clickable - the exact confusion the video2 icon overlay below replaces it with. autoPlay
      // is deliberately left off too: actually playing (and looping, and making noise) while
      // someone is just editing unrelated text elsewhere on the slide would be more distracting
      // than useful - the real behavior shows in "▶ Vorschau" and Presentation mode instead,
      // which render through the same player.runtime.js the export uses.
      return block.assetId ? (
        <div className="weft-edit-block-video-wrap">
          <video
            src={getObjectUrl(block.assetId)}
            loop={block.loop}
            muted={block.muted}
            playsInline
            className="weft-edit-block-video"
          />
          <div className="weft-edit-block-video-icon" dangerouslySetInnerHTML={{ __html: video2IconSvg }} />
        </div>
      ) : (
        <div className="weft-edit-block-placeholder">Video wählen …</div>
      );
    case "iframe":
      return block.qrCode ? (
        <QrGatePreview block={block} />
      ) : (
        <div className="weft-edit-block-iframe-wrap">
          <IframeFrame block={block} />
          <div className="weft-edit-block-iframe-overlay" />
        </div>
      );
    case "button":
      return (
        <button type="button" className="weft-edit-block-button" tabIndex={-1}>
          {block.text || "Weiter"}
        </button>
      );
    case "quiz":
      return (
        <div className="weft-edit-block-quiz">
          <strong>{block.question || "(Frage)"}</strong>
          <ul>
            {block.options.map((opt) => (
              <li key={opt.id} className={block.correctOptionIds.includes(opt.id) ? "is-correct" : ""}>
                {opt.text}
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

/**
 * Renders the actual embedded page. Without forcedViewportWidth, it's just a plain iframe filling
 * the block (today's original behavior). With one, the iframe is given that fixed pixel width
 * (so the embedded page's own media queries/JS see a constant "window" width no matter how large
 * the module itself is displayed) - its height is DERIVED, not separately configured, from the
 * wrap's own aspect ratio (100cqh/100cqw, both container query units resolving to its rendered
 * pixel size) times that width, so the virtual viewport always has exactly the block's own shape
 * and the scaled result fills it edge to edge with no letterboxing. The scale itself is then
 * purely `100cqw / <forced width>` - all computed live in CSS with no JS measurement/
 * ResizeObserver, so it stays correct across any resize automatically.
 */
function IframeFrame({ block }: { block: IframeBlock }) {
  if (!block.forcedViewportWidth) {
    return <iframe src={block.url} sandbox={block.sandbox.join(" ")} title="Eingebetteter Inhalt" />;
  }
  const width = block.forcedViewportWidth;
  return (
    <div className="weft-edit-block-iframe-viewport-wrap">
      <iframe
        src={block.url}
        sandbox={block.sandbox.join(" ")}
        title="Eingebetteter Inhalt"
        style={{
          width: `${width}px`,
          height: `calc(${width}px * (100cqh / 100cqw))`,
          transform: `scale(calc(100cqw / ${width}px))`,
        }}
      />
    </div>
  );
}

/**
 * Directly editable on the canvas (true WYSIWYG) - contentEditable while selected, so a click
 * that selects the block also drops a cursor into it, ready to type. Its own DOM is left alone
 * by React while focused (uncontrolled) so the browser's native editing/cursor state doesn't
 * fight React's re-renders; block.html is only re-applied when it changed for a reason other
 * than this component's own last commit - undo/redo, another instance, first mount - tracked via
 * lastKnownHtml rather than just "not focused", since focus can outlast an edit (the toolbar's
 * controls restore it, and nothing forces a blur just because the user clicked Undo), and
 * skipping the resync there would let a later blur re-commit that stale, already-undone content,
 * silently undoing the undo. Written back to the document on blur or via richText.ts's
 * applyFormat (the sidebar's formatting buttons never actually take focus away from here - see
 * BlockPanel.tsx).
 */
function EditableText({
  block,
  selected,
  onUpdate,
}: {
  block: TextBlock;
  selected: boolean;
  onUpdate?: (patch: Partial<Block>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // null (never a real value once committed/synced) so the very first effect run below always
  // syncs the initial content into the DOM, instead of comparing block.html to itself and
  // concluding there's nothing to do.
  const lastKnownHtml = useRef<string | null>(null);

  useEffect(() => {
    if (ref.current && block.html !== lastKnownHtml.current) {
      ref.current.innerHTML = block.html;
      lastKnownHtml.current = block.html;
    }
  }, [block.html]);

  useEffect(() => {
    if (selected) ref.current?.focus();
  }, [selected]);

  function commit(html: string) {
    // Guard explicitly rather than relying on edit()'s own no-op detection upstream - blur fires
    // on every click into the sidebar toolbar (each control hands focus back afterwards), so
    // without this an unrelated formatting action, or even just clicking into the text and back
    // out without typing, would commit identical content as a spurious extra undo step - which
    // then falls in front of the real edit being undone, making Undo look like it did nothing.
    if (html === lastKnownHtml.current) return;
    lastKnownHtml.current = html;
    onUpdate?.({ html });
  }

  return (
    <div
      ref={ref}
      className="weft-edit-block-text"
      contentEditable={selected}
      suppressContentEditableWarning
      onFocus={() => ref.current && registerActiveEditable({ el: ref.current, commit })}
      onBlur={(e) => {
        if (ref.current) commit(ref.current.innerHTML);
        // A <select>/color/number input in the sidebar toolbar can't avoid taking focus itself
        // to work (unlike a plain button, which never takes focus in the first place - see
        // BlockPanel.tsx's onMouseDown+preventDefault), so this fires for those too. Keep
        // richText.ts's "active editor" alive across that hop - applyFormat/applyFontSize
        // restore the selection and focus back here once the control's own value change fires -
        // rather than tearing it down, which would make formatting from those controls no-op.
        const goingToFormatControl = e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest("[data-weft-format-control]");
        if (!goingToFormatControl) registerActiveEditable(null);
      }}
      onMouseUp={saveSelection}
      onKeyUp={saveSelection}
    />
  );
}

function QrGatePreview({ block }: { block: IframeBlock }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!block.url) {
      setSvg(null);
      return;
    }
    let cancelled = false;
    QRCode.toString(block.url, { type: "svg", margin: 1 })
      .then((result) => {
        if (!cancelled) setSvg(result);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [block.url]);

  return (
    <div className="weft-edit-block-qr-gate">
      {svg ? (
        <div className="weft-edit-block-qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="weft-edit-block-qr-code is-empty" />
      )}
      <span className="weft-edit-block-qr-link">{block.url || "(keine Adresse)"}</span>
    </div>
  );
}
