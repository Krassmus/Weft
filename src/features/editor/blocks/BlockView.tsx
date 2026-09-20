import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import QRCode from "qrcode";
import { useAssetStore } from "../../../core/assets/assetStore";
import type { Block, BlockPosition, IframeBlock } from "../../../core/types";
import type { HandleId } from "./resizeMath";
import { clampMove, distanceToEdge, HANDLES, resizeFromHandle } from "./resizeMath";

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

  function handlePointerDownMove(e: ReactPointerEvent) {
    if (locked || !selected) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || distanceToEdge(e.clientX, e.clientY, rect) > EDGE_GRAB_PX) return;

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
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setNearEdge(distanceToEdge(e.clientX, e.clientY, rect) <= EDGE_GRAB_PX);
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
      committed = resizeFromHandle(handle, startPosition, dxPercent, dyPercent);
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
        <BlockContent block={block} />
      </div>
      {selected &&
        !locked &&
        HANDLES.map((h) => (
          <div
            key={h.id}
            className={`weft-resize-handle weft-resize-handle-${h.id}`}
            onPointerDown={(e) => handleResizeStart(h.id, e)}
          />
        ))}
    </div>
  );
}

function BlockContent({ block }: { block: Block }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);

  switch (block.kind) {
    case "text":
      return <div className="weft-edit-block-text" dangerouslySetInnerHTML={{ __html: block.html }} />;
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
