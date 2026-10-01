import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import playIconSvg from "../../../mockups/icons/play.svg?raw";
import { ASPECT_RATIO_CSS } from "../../core/aspectRatio";
import {
  addImageBlockToLayout,
  addImageBlockToPage,
  addVideoBlockToLayout,
  addVideoBlockToPage,
  bringBlockToFront,
  bringGroupToFront,
  groupBlocks,
  removeBlock,
  removeBlocks,
  removeGroup,
  removeLayoutBlock,
  sendBlockToBack,
  sendGroupToBack,
  ungroupBlocks,
  updateBlock,
  updateBlockPositions,
  updateLayoutBlock,
} from "../../core/document/actions";
import type { VideoUploadResult } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import type { BlockContainerRef } from "../../core/document/store";
import { warnUnplayableVideo } from "../../core/io/fileIO";
import type { BlockGroup, BlockPosition, Layout, Page, WeftDocument } from "../../core/types";
import type { ContextMenuItem } from "./ContextMenu";
import { BlockView } from "./blocks/BlockView";
import type { HandleId } from "./blocks/resizeMath";
import { clampGroupMove, clampMove, groupBoundingBox, HANDLES, resizeFromHandle, round, scalePositionWithinBox } from "./blocks/resizeMath";
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

// Same drag-threshold idiom as BlockView's own move/resize drags (handlePointerDownMove,
// handleResizeStart) - a plain click shouldn't register as a marquee/group drag just because the
// mouse moved a sub-pixel amount between mousedown and mouseup.
const DRAG_THRESHOLD_PX = 3;

/**
 * A finished marquee or group-resize drag still fires a native "click" at whatever happens to be
 * under the cursor at release - often one of the very blocks the drag just selected (a marquee
 * dragged diagonally across several objects very commonly ends right on top of one of them; a
 * group-resize handle can likewise end up over a member once the box has shrunk). Left alone, that
 * block's own onClick would immediately collapse the fresh multi-selection back down to just
 * itself, which is exactly what made the marquee "not select anything" - it did, for one render,
 * and then the trailing click silently overwrote it.
 *
 * A capturing, one-time listener on window intercepts that click before it can reach ANY
 * element's own onClick - the capture phase runs top-down, from window to the actual target,
 * strictly before the target's own (bubble-phase) listeners ever see the event, so stopping it
 * here works regardless of whether the release point was bare stage or a block. Registered fresh
 * for each drag (immediately before the click it's meant to catch) rather than once up front, so
 * it never lingers to swallow some later, unrelated click.
 */
function suppressNextClick() {
  window.addEventListener(
    "click",
    (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    },
    { capture: true, once: true },
  );
}

/** The BlockGroup `blockId` belongs to, if any - a block is a member of at most one group at a
 * time (see BlockGroup's own doc comment in core/types.ts). */
function findGroupForBlock(page: Page, blockId: string): BlockGroup | undefined {
  return page.groups.find((g) => g.blockIds.includes(blockId));
}

interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Whether a block's own position rectangle overlaps the marquee rectangle at all (both already
 * in percent-of-stage space, the same space BlockPosition itself uses) - any overlap counts, same
 * as Keynote/PowerPoint's own drag-select. */
function positionIntersectsMarquee(position: BlockPosition, rect: MarqueeRect): boolean {
  return position.x < rect.x1 && position.x + position.width > rect.x0 && position.y < rect.y1 && position.y + position.height > rect.y0;
}

/** One shared live-position map for both a group move and a group resize drag (see
 * startGroupMove/GroupResizeOverlay below) - whichever member ids are present here override their
 * block's own position prop (BlockView's livePositionOverride) for the duration of the drag,
 * committed to the document in one updateBlockPositions call on pointerup. */
type GroupLivePositions = { id: string; position: BlockPosition }[];

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

/**
 * The resize handles for a selected (and not currently "entered", see Canvas's own
 * enteredGroupId) group - a virtual box around every member's union (see groupBoundingBox), drawn
 * and dragged exactly like a single block's own corner/edge handles (same HANDLES set,
 * resizeFromHandle), but on commit every member is re-expressed as the same fraction of the new
 * box it was of the old one (scalePositionWithinBox) instead of just resizing one block - that's
 * the "scales proportionally like Keynote" behavior.
 */
function GroupResizeOverlay({
  page,
  group,
  stageRef,
  onLiveChange,
}: {
  page: Page;
  group: BlockGroup;
  stageRef: RefObject<HTMLDivElement | null>;
  onLiveChange: (positions: GroupLivePositions | null) => void;
}) {
  const members = page.blocks.filter((b) => group.blockIds.includes(b.id));
  const [liveBox, setLiveBox] = useState<BlockPosition | null>(null);
  const box = liveBox ?? groupBoundingBox(members.map((m) => m.position));

  function handlePointerDown(handle: HandleId, e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    const startBox = groupBoundingBox(members.map((m) => m.position));
    const startPositions: GroupLivePositions = members.map((m) => ({ id: m.id, position: m.position }));
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let started = false;
    let committed = startPositions;

    function handleMove(ev: PointerEvent) {
      ev.preventDefault();
      started = true;
      const dxPercent = ((ev.clientX - startClientX) / stage!.width) * 100;
      const dyPercent = ((ev.clientY - startClientY) / stage!.height) * 100;
      const newBox = resizeFromHandle(handle, startBox, stage!, dxPercent, dyPercent);
      committed = startPositions.map((p) => ({ id: p.id, position: scalePositionWithinBox(p.position, startBox, newBox) }));
      setLiveBox(newBox);
      onLiveChange(committed);
    }

    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      document.body.style.cursor = "";
      if (started) {
        updateBlockPositions({ kind: "page", pageId: page.id }, committed);
        suppressNextClick();
      }
      setLiveBox(null);
      onLiveChange(null);
    }

    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <div
      className="weft-group-resize-overlay"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
    >
      {HANDLES.map((h) => (
        <div
          key={h.id}
          className={`weft-resize-handle weft-resize-handle-${h.id}`}
          onPointerDown={(e) => handlePointerDown(h.id, e)}
          // A resize drag still ends with a plain "click" on whatever's under the cursor at
          // release - stopPropagation here keeps it from bubbling up to .weft-stage's own onClick
          // (which would otherwise collapse the group selection back down to the page the instant
          // a resize finishes, since the handle itself - not any one member block, which already
          // guards its own click the same way - is what the click actually lands on).
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </div>
  );
}

export function Canvas({ onPresent }: { onPresent: (startPageId: string | null) => void }) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const [dragOver, setDragOver] = useState(false);
  // Not state - updating it must never itself trigger a render, only ever be read by the next
  // one (see resolveEditTarget's own fallbackPageId parameter).
  const lastPageIdRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Set by a member's onDoubleClick (see BlockView's own doc comment on that prop) - while this
  // names the CURRENT selection's own group, a plain click on one of that group's other members
  // selects it directly instead of re-selecting the whole group, matching the sidebar's own
  // indented member rows. Cleared below whenever the selection moves to something unrelated to it.
  const [enteredGroupId, setEnteredGroupId] = useState<string | null>(null);
  // Live position overrides driven by a group move (see the stage's own onPointerDown below) or a
  // group resize (see GroupResizeOverlay) - fed into each affected BlockView as
  // livePositionOverride so every member visually follows the drag before it's committed.
  const [groupLiveOverrides, setGroupLiveOverrides] = useState<GroupLivePositions | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  // The block ids a live marquee drag currently covers (see startMarquee) - fed into each
  // affected BlockView as marqueeHover so it previews as "about to be selected" (the same dashed
  // outline a plain mouse hover already gives it) while the rectangle is still being drawn,
  // before anything is actually committed as the selection on release.
  const [marqueeHoverIds, setMarqueeHoverIds] = useState<string[] | null>(null);

  const target = resolveEditTarget(doc, selection, lastPageIdRef.current);
  if (target?.kind === "page") lastPageIdRef.current = target.page.id;
  const aspect = ASPECT_RATIO_CSS[doc.content.aspectRatio];
  // Move-snapping candidates for a page block: the (locked, read-only) layout blocks showing
  // through underneath it are visually part of the same slide, so they're worth snapping against
  // too, not just the page's own blocks.
  const pageSiblingBlocks = target?.kind === "page" ? [...(target.layout?.blocks ?? []), ...target.page.blocks] : [];
  // The active "group"/"blocks" selection's own member ids, if the current page target is what
  // it's actually selected on - computed once here rather than re-derived per block below, since
  // several things (each block's groupSelected/isPartOfCurrentSelection, the stage's own group-
  // drag dispatch, the resize overlay) all need the same answer.
  const activeGroup =
    target?.kind === "page" && selection?.type === "group" && selection.pageId === target.page.id
      ? target.page.groups.find((g) => g.id === selection.groupId)
      : undefined;
  const activeBlocksIds =
    target?.kind === "page" && selection?.type === "blocks" && selection.container.kind === "page" && selection.container.pageId === target.page.id
      ? selection.blockIds
      : null;
  const activeMoveIds = activeGroup ? activeGroup.blockIds : activeBlocksIds;

  useArrowMove(doc, selection);
  const { zoom, resetZoom, wrapRef: stageWrapRef, zoomBoxRef } = useStageZoom();

  // The "entered" group stops being meaningful the moment the selection moves to a block in a
  // different group (or to anything that isn't a plain block selection at all) - e.g. clicking the
  // sidebar, selecting the page, or picking a different object outright.
  useEffect(() => {
    if (!enteredGroupId) return;
    if (
      target?.kind === "page" &&
      selection?.type === "block" &&
      selection.container.kind === "page" &&
      findGroupForBlock(target.page, selection.blockId)?.id === enteredGroupId
    ) {
      return;
    }
    setEnteredGroupId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

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

  /** Drags every member of the active "blocks"/"group" selection together - reached via a
   * pointerdown that bubbled all the way up from one of those members (see BlockView's own
   * groupSelected prop, which makes it back off instead of starting its own solo drag). Same
   * threshold/pointermove/pointerup-on-window idiom as BlockView's handlePointerDownMove, just
   * driving every member's position via clampGroupMove + one updateBlockPositions on finish
   * instead of a single block's own clampMove + onUpdate. */
  function startGroupMove(e: ReactPointerEvent, page: Page, memberIds: string[]) {
    if (e.button !== 0) return;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    e.preventDefault();
    const startPositions: GroupLivePositions = page.blocks.filter((b) => memberIds.includes(b.id)).map((b) => ({ id: b.id, position: b.position }));
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let started = false;
    let committed = startPositions;

    function handleMove(ev: PointerEvent) {
      if (!started) {
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < DRAG_THRESHOLD_PX) return;
        started = true;
        document.body.classList.add("weft-dragging");
      }
      ev.preventDefault();
      const dxPercent = ((ev.clientX - startClientX) / stage!.width) * 100;
      const dyPercent = ((ev.clientY - startClientY) / stage!.height) * 100;
      const { dx, dy } = clampGroupMove(startPositions.map((p) => p.position), dxPercent, dyPercent);
      committed = startPositions.map((p) => ({ id: p.id, position: { ...p.position, x: round(p.position.x + dx), y: round(p.position.y + dy) } }));
      setGroupLiveOverrides(committed);
    }

    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      if (started) {
        updateBlockPositions({ kind: "page", pageId: page.id }, committed);
        suppressNextClick();
      }
      setGroupLiveOverrides(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  /** A drag-select rectangle started on empty background - either the page stage's own white
   * area, or the surrounding black letterbox padding around it (see the wrap's own onPointerDown
   * below, which routes every background pointerdown here; never reached for one that lands on a
   * block). Always measured against the STAGE's own rect, not whichever element the drag actually
   * started on, and deliberately NOT clamped to the visible 0-100% page the way a click-to-select
   * is - a block can be dragged well past the slide's own edge and stay there, grabbable, in that
   * surrounding padding (see clampMove's OFF_STAGE_MARGIN_PERCENT), so the rectangle has to be
   * able to reach negative/over-100% coordinates to ever rubber-band one of those in. Intersects
   * the live rectangle against every top-level block each move (expanding any hit grouped block to
   * its whole group, matching Shift+Click's own behavior - see toggleShiftSelect), and commits
   * whatever it ends up covering as the selection on release: zero blocks clears to the page, one
   * collapses to a plain block selection, more than one becomes a "blocks" multi-selection (or, if
   * they happen to be exactly one existing group's full membership, that group directly). */
  function startMarquee(e: ReactPointerEvent, page: Page) {
    if (e.button !== 0) return;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    // Suppress the browser's native text/image drag-selection for the whole gesture, from this
    // very first pointerdown - preventDefault() here alone only suppresses it for the element the
    // drag actually started on; once the cursor moves over unrelated selectable text elsewhere on
    // the page (e.g. the Timeline's own labels below the canvas, or the Inspector), the browser
    // still happily starts its own native selection drag there unless user-select is also turned
    // off up front. body.weft-dragging's user-select:none (App.css) is the one thing that reliably
    // covers that - added immediately, not deferred until the drag threshold is crossed, since a
    // selection can otherwise already be underway by the time that check first passes.
    e.preventDefault();
    document.body.classList.add("weft-dragging");
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let started = false;
    let hitIds: string[] = [];

    function toPercent(clientX: number, clientY: number) {
      return {
        x: ((clientX - stage!.left) / stage!.width) * 100,
        y: ((clientY - stage!.top) / stage!.height) * 100,
      };
    }

    function handleMove(ev: PointerEvent) {
      if (!started) {
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < DRAG_THRESHOLD_PX) return;
        started = true;
      }
      ev.preventDefault();
      const start = toPercent(startClientX, startClientY);
      const cur = toPercent(ev.clientX, ev.clientY);
      const rect: MarqueeRect = { x0: Math.min(start.x, cur.x), y0: Math.min(start.y, cur.y), x1: Math.max(start.x, cur.x), y1: Math.max(start.y, cur.y) };
      setMarqueeRect(rect);
      const hitBlockIds = page.blocks.filter((b) => positionIntersectsMarquee(b.position, rect)).map((b) => b.id);
      const idSet = new Set<string>();
      for (const id of hitBlockIds) {
        const group = findGroupForBlock(page, id);
        if (group) group.blockIds.forEach((memberId) => idSet.add(memberId));
        else idSet.add(id);
      }
      hitIds = [...idSet];
      setMarqueeHoverIds(hitIds);
    }

    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      setMarqueeRect(null);
      setMarqueeHoverIds(null);
      if (!started) return;
      suppressNextClick();
      const container: BlockContainerRef = { kind: "page", pageId: page.id };
      if (hitIds.length === 0) {
        select({ type: "page", pageId: page.id });
      } else if (hitIds.length === 1) {
        select({ type: "block", container, blockId: hitIds[0] });
      } else {
        const coveredGroup = page.groups.find((g) => g.blockIds.length === hitIds.length && g.blockIds.every((id) => hitIds.includes(id)));
        if (coveredGroup) select({ type: "group", pageId: page.id, groupId: coveredGroup.id });
        else select({ type: "blocks", container, blockIds: hitIds });
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  /** Shift+Click on a block - adds it (or, if it belongs to one, its whole group) to the active
   * "blocks" multi-selection, or removes it if already present. Reduces back down to a plain
   * block selection at one id, or clears to the page at zero - see SelectionRef's own doc comment
   * in store.ts for why a "blocks" selection never sits at fewer than two ids. */
  function toggleShiftSelect(page: Page, blockId: string) {
    const group = findGroupForBlock(page, blockId);
    const idsToToggle = group ? group.blockIds : [blockId];
    const container: BlockContainerRef = { kind: "page", pageId: page.id };
    const current: string[] =
      selection?.type === "blocks" && selection.container.kind === "page" && selection.container.pageId === page.id
        ? selection.blockIds
        : selection?.type === "block" && selection.container.kind === "page" && selection.container.pageId === page.id
          ? [selection.blockId]
          : selection?.type === "group" && selection.pageId === page.id
            ? (page.groups.find((g) => g.id === selection.groupId)?.blockIds ?? [])
            : [];
    const allPresent = idsToToggle.every((id) => current.includes(id));
    const next = allPresent ? current.filter((id) => !idsToToggle.includes(id)) : [...new Set([...current, ...idsToToggle])];
    if (next.length === 0) select({ type: "page", pageId: page.id });
    else if (next.length === 1) select({ type: "block", container, blockId: next[0] });
    else select({ type: "blocks", container, blockIds: next });
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
        onPointerDown={(e) => {
          // Marquee/group-drag is page-only (see the plan's scope cuts) and needs real page data,
          // so there's nothing to do here while editing a layout.
          if (target?.kind !== "page") return;
          // A block can be dragged well past the slide's own edge and stay there, grabbable, in
          // this surrounding letterbox area (see clampMove's OFF_STAGE_MARGIN_PERCENT) - so
          // "start a marquee/group-drag from empty background" has to cover this whole wrap, not
          // just the white .weft-stage page sitting inside it. Attached here (once, at the wrap
          // level) rather than separately on .weft-stage too, since a pointerdown that starts
          // inside the stage already bubbles up to this same handler - attaching it twice would
          // start two drags for one gesture. `.closest` (rather than an exact element check)
          // is what makes this work uniformly for both "background" cases (bare wrap padding, or
          // the stage's own white background) by just asking "is this bubbling up from a block at
          // all", not caring which particular background element it started on.
          const blockEl = (e.target as HTMLElement).closest(".weft-edit-block");
          if (blockEl) {
            // Bubbled up from a block that backed off its own drag because it's part of the
            // active selection (see BlockView's groupSelected prop) - drag that whole selection
            // together instead of starting a marquee.
            if (activeMoveIds) startGroupMove(e, target.page, activeMoveIds);
            return;
          }
          startMarquee(e, target.page);
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
                  onBringToFront={() => bringBlockToFront({ kind: "layout", layoutId: target.layout.id }, block.id)}
                  onSendToBack={() => sendBlockToBack({ kind: "layout", layoutId: target.layout.id }, block.id)}
                  siblingPositions={target.layout.blocks.filter((b) => b.id !== block.id).map((b) => b.position)}
                />
              ))}
            </div>
          </div>
        ) : target?.kind === "page" ? (
          <div className="weft-canvas-stage-zoom" ref={zoomBoxRef}>
            <div
              ref={stageRef}
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
              {target.page.blocks.map((block) => {
                const group = findGroupForBlock(target.page, block.id);
                const isSoloSelected =
                  selection?.type === "block" &&
                  selection.container.kind === "page" &&
                  selection.container.pageId === target.page.id &&
                  selection.blockId === block.id;
                const partOfActiveGroup = Boolean(group && activeGroup?.id === group.id);
                const partOfActiveBlocks = Boolean(activeBlocksIds?.includes(block.id));
                const groupSelected = partOfActiveGroup || partOfActiveBlocks;
                const isPartOfCurrentSelection = groupSelected || isSoloSelected;

                let extraMenuItems: ContextMenuItem[] = [];
                if (partOfActiveBlocks && activeBlocksIds && activeBlocksIds.length >= 2) {
                  extraMenuItems = [
                    {
                      label: "Objekte gruppieren",
                      onClick: () => {
                        const groupId = groupBlocks(target.page.id, activeBlocksIds);
                        if (groupId) select({ type: "group", pageId: target.page.id, groupId });
                      },
                    },
                  ];
                } else if (partOfActiveGroup && activeGroup) {
                  extraMenuItems = [
                    {
                      label: "Gruppe auflösen",
                      onClick: () => {
                        ungroupBlocks(target.page.id, activeGroup.id);
                        select({ type: "blocks", container: { kind: "page", pageId: target.page.id }, blockIds: activeGroup.blockIds });
                      },
                    },
                  ];
                }

                const onBringToFront = partOfActiveGroup && activeGroup
                  ? () => bringGroupToFront(target.page.id, activeGroup.id)
                  : () => bringBlockToFront({ kind: "page", pageId: target.page.id }, block.id);
                const onSendToBack = partOfActiveGroup && activeGroup
                  ? () => sendGroupToBack(target.page.id, activeGroup.id)
                  : () => sendBlockToBack({ kind: "page", pageId: target.page.id }, block.id);
                const onDelete =
                  partOfActiveGroup && activeGroup
                    ? () => {
                        removeGroup(target.page.id, activeGroup.id);
                        select({ type: "page", pageId: target.page.id });
                      }
                    : partOfActiveBlocks && activeBlocksIds
                      ? () => {
                          removeBlocks({ kind: "page", pageId: target.page.id }, activeBlocksIds);
                          select({ type: "page", pageId: target.page.id });
                        }
                      : () => {
                          removeBlock(target.page.id, block.id);
                          select({ type: "page", pageId: target.page.id });
                        };

                return (
                  <BlockView
                    key={block.id}
                    block={block}
                    locked={false}
                    selected={isSoloSelected}
                    groupSelected={groupSelected}
                    marqueeHover={marqueeHoverIds?.includes(block.id) ?? false}
                    isPartOfCurrentSelection={isPartOfCurrentSelection}
                    livePositionOverride={groupLiveOverrides?.find((p) => p.id === block.id)?.position ?? null}
                    onSelect={() => {
                      if (group && enteredGroupId !== group.id) {
                        select({ type: "group", pageId: target.page.id, groupId: group.id });
                      } else {
                        select({ type: "block", container: { kind: "page", pageId: target.page.id }, blockId: block.id });
                      }
                    }}
                    onShiftSelect={() => toggleShiftSelect(target.page, block.id)}
                    onDoubleClick={
                      group
                        ? () => {
                            setEnteredGroupId(group.id);
                            select({ type: "block", container: { kind: "page", pageId: target.page.id }, blockId: block.id });
                          }
                        : undefined
                    }
                    extraMenuItems={extraMenuItems}
                    onUpdate={(patch) => updateBlock(target.page.id, block.id, patch)}
                    onDelete={onDelete}
                    onBringToFront={onBringToFront}
                    onSendToBack={onSendToBack}
                    siblingPositions={pageSiblingBlocks.filter((b) => b.id !== block.id).map((b) => b.position)}
                  />
                );
              })}
              {activeGroup && !enteredGroupId && (
                <GroupResizeOverlay page={target.page} group={activeGroup} stageRef={stageRef} onLiveChange={setGroupLiveOverrides} />
              )}
              {marqueeRect && (
                <div
                  className="weft-marquee"
                  style={{
                    left: `${marqueeRect.x0}%`,
                    top: `${marqueeRect.y0}%`,
                    width: `${marqueeRect.x1 - marqueeRect.x0}%`,
                    height: `${marqueeRect.y1 - marqueeRect.y0}%`,
                  }}
                />
              )}
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
