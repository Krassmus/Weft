import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import playIconSvg from "../../../mockups/icons/play.svg?raw";
import { ASPECT_RATIO_CSS } from "../../core/aspectRatio";
import {
  addImageBlockToLayout,
  addImageBlockToPage,
  addVideoBlockToLayout,
  addVideoBlockToPage,
  removeBlock,
  removeLayoutBlock,
  updateBlock,
  updateLayoutBlock,
} from "../../core/document/actions";
import type { VideoUploadResult } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import type { BlockContainerRef } from "../../core/document/store";
import { warnUnplayableVideo } from "../../core/io/fileIO";
import type { BlockPosition, Layout, Page, WeftDocument } from "../../core/types";
import { BlockView } from "./blocks/BlockView";
import { clampMove } from "./blocks/resizeMath";
import { Timeline } from "./Timeline";

const ARROW_STEP_PERCENT = 1;
const ARROW_STEP_PERCENT_FAST = 5;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
// Trackpad pinch gestures arrive as wheel events with only a handful of deltaY units per step -
// exponential response (see useStageZoom) keeps the FEEL of a given pinch distance the same at
// any zoom level, rather than a fixed-percent step that feels twitchy when zoomed in far.
const ZOOM_WHEEL_SENSITIVITY = 0.015;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Starting footprint for a dropped image or video, centered on the cursor - addImageBlockToPage/
// addVideoBlockToPage (etc.) immediately reshape it to the file's own aspect ratio (see
// fitToAspect in core/document/actions.ts), so this only sets the initial area, not the final
// proportions.
const DROP_MEDIA_WIDTH = 40;
const DROP_MEDIA_HEIGHT = 30;
// Dropping several files at once cascades each further one a bit, so they don't land in one
// exact pile - same idea as the paste offset in core/document/actions.ts.
const DROP_CASCADE_PERCENT = 4;

function clampAxis(value: number, size: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, 100 - size));
}

function dropPosition(clientX: number, clientY: number, stageRect: DOMRect, cascadeIndex: number): BlockPosition {
  const centerX = ((clientX - stageRect.left) / stageRect.width) * 100;
  const centerY = ((clientY - stageRect.top) / stageRect.height) * 100;
  const offset = cascadeIndex * DROP_CASCADE_PERCENT;
  return {
    x: clampAxis(centerX - DROP_MEDIA_WIDTH / 2 + offset, DROP_MEDIA_WIDTH),
    y: clampAxis(centerY - DROP_MEDIA_HEIGHT / 2 + offset, DROP_MEDIA_HEIGHT),
    width: DROP_MEDIA_WIDTH,
    height: DROP_MEDIA_HEIGHT,
  };
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

/**
 * Arrow keys nudge the selected block (Shift for a bigger step); Delete/Backspace isn't handled
 * here, only movement. Only ever fires for a block the user could otherwise drag, since selection
 * can only reach a block via BlockView's own onSelect, which Canvas never wires up for the
 * read-only layout blocks shown underneath a page - so no separate "locked" check is needed here.
 */
function useArrowMove(doc: WeftDocument, selection: ReturnType<typeof useDocumentStore.getState>["selection"]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selection || selection.type !== "block") return;
      if (isEditableTarget(document.activeElement)) return;

      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if (dx === 0 && dy === 0) return;

      const { container, blockId } = selection;
      const block =
        container.kind === "page"
          ? doc.content.pages[container.pageId]?.blocks.find((b) => b.id === blockId)
          : doc.content.layouts[container.layoutId]?.blocks.find((b) => b.id === blockId);
      if (!block) return;

      e.preventDefault();
      const step = e.shiftKey ? ARROW_STEP_PERCENT_FAST : ARROW_STEP_PERCENT;
      const position = clampMove(block.position, dx * step, dy * step);
      if (container.kind === "page") updateBlock(container.pageId, blockId, { position });
      else updateLayoutBlock(container.layoutId, blockId, { position });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, selection]);
}

/**
 * Trackpad pinch-to-zoom (and Ctrl+scroll-wheel, the same gesture on a mouse) for the canvas -
 * browsers report both as a "wheel" event with ctrlKey set, which is also how they'd normally
 * trigger the OS/browser's own page zoom, so this has to preventDefault() to claim the gesture for
 * the canvas instead. That only works from a real (non-passive) DOM listener - React's own onWheel
 * prop is passive - hence the manual addEventListener below rather than JSX.
 *
 * Zooms around the point under the cursor (like Keynote, Figma, Google Maps, ...): after the zoom
 * level changes, the wrap's scroll position is corrected so whichever part of the slide was under
 * the cursor stays there, instead of the view recentering on every step. Done by recording the
 * cursor's fractional position across the (still old-sized) zoom box on wheel, then - once the DOM
 * has the new size, in a layout effect so this runs before paint - solving for the scroll offset
 * that puts that same fraction back under the cursor.
 */
function useStageZoom() {
  const [zoom, setZoom] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoomBoxRef = useRef<HTMLDivElement>(null);
  const pendingAnchorRef = useRef<{ clientX: number; clientY: number; fracX: number; fracY: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return; // a plain two-finger scroll/swipe should keep panning, not zoom
      e.preventDefault();
      const box = zoomBoxRef.current;
      if (!box) return;
      const boxRect = box.getBoundingClientRect();
      if (boxRect.width === 0 || boxRect.height === 0) return;
      const fracX = (e.clientX - boxRect.left) / boxRect.width;
      const fracY = (e.clientY - boxRect.top) / boxRect.height;
      setZoom((prevZoom) => {
        const nextZoom = clamp(prevZoom * Math.exp(-e.deltaY * ZOOM_WHEEL_SENSITIVITY), ZOOM_MIN, ZOOM_MAX);
        if (nextZoom !== prevZoom) pendingAnchorRef.current = { clientX: e.clientX, clientY: e.clientY, fracX, fracY };
        return nextZoom;
      });
    }

    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    pendingAnchorRef.current = null;
    const wrap = wrapRef.current;
    const box = zoomBoxRef.current;
    if (!anchor || !wrap || !box) return;
    const wrapRect = wrap.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    // The zoom box's own position within the wrap's scrollable content (i.e. as if scrolled to
    // the very top-left) - independent of the current scroll offset, so it stays valid as a basis
    // for the scrollLeft/scrollTop this solves for below.
    const boxContentLeft = wrap.scrollLeft + (boxRect.left - wrapRect.left);
    const boxContentTop = wrap.scrollTop + (boxRect.top - wrapRect.top);
    const targetContentX = boxContentLeft + anchor.fracX * boxRect.width;
    const targetContentY = boxContentTop + anchor.fracY * boxRect.height;
    wrap.scrollLeft = targetContentX - (anchor.clientX - wrapRect.left);
    wrap.scrollTop = targetContentY - (anchor.clientY - wrapRect.top);
  }, [zoom]);

  return { zoom, resetZoom: () => setZoom(1), wrapRef, zoomBoxRef };
}

type EditTarget = { kind: "page"; page: Page; layout: Layout | null } | { kind: "layout"; layout: Layout };

function pageTarget(content: WeftDocument["content"], page: Page): EditTarget {
  return { kind: "page", page, layout: page.layoutId ? (content.layouts[page.layoutId] ?? null) : null };
}

function resolveEditTarget(
  doc: WeftDocument,
  selection: ReturnType<typeof useDocumentStore.getState>["selection"],
  fallbackPageId: string | null,
): EditTarget | null {
  const { content } = doc;

  if (selection?.type === "layout") {
    const layout = content.layouts[selection.layoutId];
    return layout ? { kind: "layout", layout } : null;
  }
  if (selection?.type === "page") {
    const page = content.pages[selection.pageId];
    return page ? pageTarget(content, page) : null;
  }
  if (selection?.type === "block") {
    if (selection.container.kind === "page") {
      const page = content.pages[selection.container.pageId];
      return page ? pageTarget(content, page) : null;
    }
    const layout = content.layouts[selection.container.layoutId];
    return layout ? { kind: "layout", layout } : null;
  }
  if (selection?.type === "logic") return null;
  if (selection?.type === "event") {
    const page = content.pages[selection.pageId];
    return page ? pageTarget(content, page) : null;
  }

  // No selection at all (deleting something clears it down to null in a couple of places) -
  // stay on whichever page was last actually shown, rather than resetting to the module's very
  // first slide every time. That page may itself be gone now (e.g. it was the one just deleted,
  // not just an object on it), in which case fall through to the first-slide default below same
  // as always.
  if (fallbackPageId) {
    const page = content.pages[fallbackPageId];
    if (page) return pageTarget(content, page);
  }

  const first = content.sequence[0];
  if (!first) return null;
  if (first.kind === "page") {
    const page = content.pages[first.pageId];
    return page ? pageTarget(content, page) : null;
  }
  const logicBlock = content.logicBlocks[first.logicBlockId];
  const firstPageId = logicBlock?.branches[0]?.pageIds[0];
  const page = firstPageId ? content.pages[firstPageId] : null;
  return page ? pageTarget(content, page) : null;
}

export function Canvas({ onPresent }: { onPresent: (startPageId: string | null) => void }) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const [dragOver, setDragOver] = useState(false);
  // Not state - updating it must never itself trigger a render, only ever be read by the next
  // one (see resolveEditTarget's own fallbackPageId parameter).
  const lastPageIdRef = useRef<string | null>(null);

  const target = resolveEditTarget(doc, selection, lastPageIdRef.current);
  if (target?.kind === "page") lastPageIdRef.current = target.page.id;
  const aspect = ASPECT_RATIO_CSS[doc.content.aspectRatio];
  // Move-snapping candidates for a page block: the (locked, read-only) layout blocks showing
  // through underneath it are visually part of the same slide, so they're worth snapping against
  // too, not just the page's own blocks.
  const pageSiblingBlocks = target?.kind === "page" ? [...(target.layout?.blocks ?? []), ...target.page.blocks] : [];

  useArrowMove(doc, selection);
  const { zoom, resetZoom, wrapRef: stageWrapRef, zoomBoxRef } = useStageZoom();

  function handleDragOver(e: ReactDragEvent<HTMLDivElement>) {
    // Only react to an actual file drag (e.g. from the Finder) - not our own internal block
    // dragging, which uses Pointer Events and never sets a "Files" payload.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  async function handleMediaDrop(
    e: ReactDragEvent<HTMLDivElement>,
    container: BlockContainerRef,
    addImage: (file: File, position: BlockPosition) => Promise<string>,
    addVideo: (file: File, position: BlockPosition) => Promise<{ blockId: string } & VideoUploadResult>,
  ) {
    e.preventDefault();
    setDragOver(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const mediaFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    // Sequential, not Promise.all - addImage/addVideo reads the file's own dimensions before
    // editing the document, and each edit() call is its own undo step, so keeping them in drop
    // order keeps undo order sane too.
    let lastBlockId: string | null = null;
    const unplayable: { fileName: string; ffmpegAttempted: boolean; error?: string }[] = [];
    for (const [index, file] of mediaFiles.entries()) {
      const position = dropPosition(e.clientX, e.clientY, rect, index);
      if (file.type.startsWith("video/")) {
        const result = await addVideo(file, position);
        lastBlockId = result.blockId;
        if (!result.playable) unplayable.push({ fileName: file.name, ffmpegAttempted: result.ffmpegAttempted, error: result.error });
      } else {
        lastBlockId = await addImage(file, position);
      }
    }
    // Select whichever landed last, mirroring how pasting a block selects the new copy.
    if (lastBlockId) select({ type: "block", container, blockId: lastBlockId });
    if (unplayable.length > 0) void warnUnplayableVideo(unplayable);
  }

  return (
    <div className="weft-canvas">
      <div className="weft-canvas-toolbar">
        <button
          type="button"
          className="weft-canvas-play-button"
          onClick={() => onPresent(target?.kind === "page" ? target.page.id : null)}
        >
          <span className="weft-canvas-play-icon" dangerouslySetInnerHTML={{ __html: playIconSvg }} />
          Abspielen
        </button>
        {target?.kind === "layout" && <span className="weft-canvas-context">Layout: {target.layout.name}</span>}
        {zoom !== 1 && (
          <button type="button" className="weft-canvas-zoom-reset" onClick={resetZoom} title="Zoom zurücksetzen">
            {Math.round(zoom * 100)}%
          </button>
        )}
      </div>

      <div
        ref={stageWrapRef}
        className="weft-canvas-stage-wrap"
        style={{ "--zoom": zoom } as CSSProperties}
        onClick={() => {
          // The black letterbox area around the slide (visible whenever the stage doesn't fill
          // the wrap, e.g. at narrow window widths) - clicking it should feel like clicking the
          // slide's own background, which already deselects the current block via the onClick on
          // .weft-stage below. That handler only covers clicks that land on the stage itself
          // though, not this surrounding padding, so it's duplicated here. Block clicks never
          // reach this far (BlockView's onClick calls stopPropagation), so this never fights with
          // an in-progress block selection.
          if (target?.kind === "layout") select({ type: "layout", layoutId: target.layout.id });
          else if (target?.kind === "page") select({ type: "page", pageId: target.page.id });
        }}
      >
        {selection?.type === "logic" ? (
          <div className="weft-canvas-empty">Wähle eine Folie in einem Zweig, um sie zu bearbeiten.</div>
        ) : target?.kind === "layout" ? (
          <div className="weft-canvas-stage-zoom" ref={zoomBoxRef}>
            <div
              className={"weft-stage weft-stage-edit" + (dragOver ? " is-drag-over" : "")}
              style={{ aspectRatio: aspect }}
              onClick={() => select({ type: "layout", layoutId: target.layout.id })}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) =>
                handleMediaDrop(
                  e,
                  { kind: "layout", layoutId: target.layout.id },
                  (file, position) => addImageBlockToLayout(target.layout.id, file, position),
                  (file, position) => addVideoBlockToLayout(target.layout.id, file, position),
                )
              }
            >
              {target.layout.blocks.map((block) => (
                <BlockView
                  key={block.id}
                  block={block}
                  locked={false}
                  selected={
                    selection?.type === "block" &&
                    selection.container.kind === "layout" &&
                    selection.container.layoutId === target.layout.id &&
                    selection.blockId === block.id
                  }
                  onSelect={() =>
                    select({ type: "block", container: { kind: "layout", layoutId: target.layout.id }, blockId: block.id })
                  }
                  onUpdate={(patch) => updateLayoutBlock(target.layout.id, block.id, patch)}
                  onDelete={() => {
                    removeLayoutBlock(target.layout.id, block.id);
                    select({ type: "layout", layoutId: target.layout.id });
                  }}
                  siblingPositions={target.layout.blocks.filter((b) => b.id !== block.id).map((b) => b.position)}
                />
              ))}
            </div>
          </div>
        ) : target?.kind === "page" ? (
          <div className="weft-canvas-stage-zoom" ref={zoomBoxRef}>
            <div
              className={"weft-stage weft-stage-edit" + (dragOver ? " is-drag-over" : "")}
              style={{ aspectRatio: aspect }}
              onClick={() => select({ type: "page", pageId: target.page.id })}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) =>
                handleMediaDrop(
                  e,
                  { kind: "page", pageId: target.page.id },
                  (file, position) => addImageBlockToPage(target.page.id, file, position),
                  (file, position) => addVideoBlockToPage(target.page.id, file, position),
                )
              }
            >
              {target.layout?.blocks.map((block) => <BlockView key={block.id} block={block} selected={false} locked />)}
              {target.page.blocks.map((block) => (
                <BlockView
                  key={block.id}
                  block={block}
                  locked={false}
                  selected={
                    selection?.type === "block" &&
                    selection.container.kind === "page" &&
                    selection.container.pageId === target.page.id &&
                    selection.blockId === block.id
                  }
                  onSelect={() =>
                    select({ type: "block", container: { kind: "page", pageId: target.page.id }, blockId: block.id })
                  }
                  onUpdate={(patch) => updateBlock(target.page.id, block.id, patch)}
                  onDelete={() => {
                    removeBlock(target.page.id, block.id);
                    select({ type: "page", pageId: target.page.id });
                  }}
                  siblingPositions={pageSiblingBlocks.filter((b) => b.id !== block.id).map((b) => b.position)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="weft-canvas-empty">Noch keine Folie – lege links eine an.</div>
        )}
      </div>
      {target?.kind === "page" && <Timeline page={target.page} />}
    </div>
  );
}
