import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import QRCode from "qrcode";
import { useAssetStore } from "../../../core/assets/assetStore";
import type { Block, BlockPosition, IframeBlock, TextBlock } from "../../../core/types";
import { registerActiveEditable, saveSelection } from "./richText";
import type { CornerHandleId, HandleId } from "./resizeMath";
import { clampMove, CORNER_HANDLES, distanceToEdge, HANDLES, resizeCornerLocked, resizeFromHandle } from "./resizeMath";

const EDGE_GRAB_PX = 8;
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
  // An image has no inner content to preserve access to (unlike text/iframe/quiz), so it can be
  // grabbed and moved from anywhere, and only makes sense to resize from a corner, proportionally
  // - see handlePointerDownMove/handleResizeStart and the corner-only handles rendered below.
  const isImage = block.kind === "image";

  const style: CSSProperties = {
    position: "absolute",
    left: `${position.x}%`,
    top: `${position.y}%`,
    width: `${position.width}%`,
    height: `${position.height}%`,
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
    return Math.min(EDGE_GRAB_PX, rect.width * 0.2, rect.height * 0.2);
  }

  function handlePointerDownMove(e: ReactPointerEvent) {
    if (locked || !selected) return;
    if (!isImage) {
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
    if (locked || !selected) return;
    if (isImage) {
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
      const dxPercent = ((ev.clientX - startClientX) / stage!.width) * 100;
      const dyPercent = ((ev.clientY - startClientY) / stage!.height) * 100;
      committed = isImage
        ? resizeCornerLocked(handle as CornerHandleId, startPosition, stage!, dxPercent, dyPercent)
        : resizeFromHandle(handle, startPosition, dxPercent, dyPercent);
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
        (isImage ? CORNER_HANDLES : HANDLES).map((h) => (
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
    case "iframe":
      return block.qrCode ? (
        <QrGatePreview block={block} />
      ) : (
        <div className="weft-edit-block-iframe-wrap">
          <iframe src={block.url} sandbox={block.sandbox.join(" ")} title="Eingebetteter Inhalt" />
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
