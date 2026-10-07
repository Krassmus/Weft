import { presenceColor, useBlockViewers } from "../../../core/collab/presence";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import QRCode from "qrcode";
// A generic "this is a video" indicator for the (non-interactive, see below) editor canvas -
// deliberately not play.svg, which would look clickable even though clicking does nothing here;
// see player.runtime.js/.css for the real, playable preview/export instead.
import video2IconSvg from "../../../../mockups/icons/video2.svg?raw";
import checkboxCheckedSvg from "../../../../mockups/icons/checkbox-checked.svg?raw";
import checkboxUncheckedSvg from "../../../../mockups/icons/checkbox-unchecked.svg?raw";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import trashIconSvg from "../../../../mockups/icons/trash.svg?raw";
import { aspectRatioNumeric } from "../../../core/aspectRatio";
import {
  buttonText,
  quizOptionHtml,
  quizOptionPatch,
  quizQuestionHtml,
  quizQuestionPatch,
  textHtml,
  textHtmlPatch,
} from "../../../core/document/translations";
import { autonymLabel } from "../../../core/i18n/languages";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { useEditingLanguage } from "../useEditingLanguage";
import { useAssetStore } from "../../../core/assets/assetStore";
import { useDocumentStore } from "../../../core/document/store";
import { createId } from "../../../core/id";
import { confirmDestructive } from "../../../core/io/fileIO";
import type { ArrowPoint, Block, BlockPosition, IframeBlock, QuizBlock } from "../../../core/types";
import { ContextMenu, useContextMenu } from "../ContextMenu";
import type { ContextMenuItem } from "../ContextMenu";
import { registerActiveEditable, saveSelection } from "./richText";
import { ArrowHandles } from "./ArrowHandles";
import { ArrowSvg } from "./ArrowSvg";
import { ShapeSvg } from "./ShapeSvg";
import { CodeView } from "./CodeView";
import { TexView } from "./TexView";
import { useTexDialog } from "./texDialogStore";
import { usePlaceholderProblems } from "./usePlaceholderProblems";
import type { CornerHandleId, HandleId } from "./resizeMath";
import {
  clampMove,
  CORNER_HANDLES,
  edgeDistancePx,
  HANDLES,
  resizeCornerLocked,
  resizeFromHandle,
  snapCornerResize,
  snapMove,
  snapResize,
  unrotateDelta,
} from "./resizeMath";

const EDGE_GRAB_PX = 10;
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

/** Shared by both of a block's context menus - the generic one below and QuizBlockCanvas's own -
 * so "Ganz nach vorne"/"Ganz nach hinten"/delete read identically everywhere a block's menu shows
 * them. Each handler's mere presence (not `locked`, already checked before either menu opens)
 * decides whether its item appears - see BlockViewProps.onBringToFront's own doc comment for when
 * a block has none of these at all. */
function layerMenuItems(
  onBringToFront: (() => void) | undefined,
  onSendToBack: (() => void) | undefined,
  onDelete: (() => void) | undefined,
  deleteLabel = "Löschen",
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (onBringToFront) items.push({ label: "Ganz nach vorne", onClick: onBringToFront });
  if (onSendToBack) items.push({ label: "Ganz nach hinten", onClick: onSendToBack });
  if (onDelete) {
    if (items.length > 0) items.push({ separator: true });
    items.push({ label: deleteLabel, danger: true, onClick: onDelete });
  }
  return items;
}

interface BlockViewProps {
  block: Block;
  selected: boolean;
  locked: boolean;
  onSelect?: () => void;
  onUpdate?: (patch: Partial<Block>) => void;
  /** Removes this block outright - wired to a right-click "Löschen" (see the context menu below),
   * the one reliable way to delete a block that isn't image/video/iframe: those can be grabbed
   * and dragged from anywhere (see isFreelyMovableBlock), so an edge is always free for the Delete
   * key's own edge-click-to-select-then-delete flow, but a text/quiz block's whole interior is
   * contentEditable - Delete there just removes a character, never the block, and there was no
   * other on-canvas way to remove one at all. */
  onDelete?: () => void;
  /** "Ganz nach vorne"/"Ganz nach hinten" in the right-click menu below - moves this block to the
   * very end/start of its container's stacking order (the blocks' `order` keys) (see
   * reorderBlock's own doc comment in document/actions.ts: no block ever carries an explicit
   * z-index). Absent (rather than a no-op) wherever a block can't be reordered at all - the
   * read-only layout preview underneath a page's own blocks (see Canvas.tsx) - same convention
   * onDelete already uses for "not removable from here". */
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  /** Every other block sharing this slide (page blocks plus the layout blocks showing through
   * underneath, or the other blocks in the same layout when editing a layout directly) - the
   * candidate edges/centers a move-drag can snap to. See handlePointerDownMove. */
  siblingPositions?: BlockPosition[];
  /** Overrides block.position (and outranks this component's own in-drag liveOverride) while
   * Canvas is live-dragging/resizing a GROUP this block belongs to - see Canvas.tsx's own group
   * move/resize handlers, which compute every member's new position on each pointermove and feed
   * it back down here so the block visually follows along, the same way liveOverride already does
   * for this block's own solo drag. */
  livePositionOverride?: BlockPosition | null;
  /** True while this block is part of the *active* multi-block or group selection (see
   * SelectionRef's "blocks"/"group" variants in store.ts) - shows a lighter group-selection
   * outline instead of (never together with) the solo `selected` one, and most importantly makes
   * handlePointerDownMove back off before its own preventDefault/stopPropagation, so the
   * pointerdown bubbles up to Canvas's own stage-level listener, which runs the group move/resize
   * drag instead of this block's solo one. Resize handles are hidden too - a group resizes only as
   * a whole (see Canvas.tsx's group-resize overlay), never one member at a time, while selected
   * this way. */
  groupSelected?: boolean;
  /** True while a live marquee drag (see Canvas.tsx's startMarquee) currently covers this block -
   * previews it as "about to be selected" with the same dashed outline a plain mouse hover
   * already gives it (see .weft-edit-block:hover in App.css), before anything is actually
   * committed as the selection on release. Purely visual - never affects interaction. */
  marqueeHover?: boolean;
  /** Shift+Click - adds/removes this block (or, if it belongs to one, its whole group) to/from
   * the in-progress multi-selection, instead of replacing the selection the way a plain onSelect
   * click does. Absent for the read-only layout preview underneath a page, same as onSelect. */
  onShiftSelect?: () => void;
  /** Double-click - only wired for a block that belongs to a group: "enters" that group (see
   * Canvas.tsx's enteredGroupId) so this one member can be selected/edited directly, same as
   * clicking its own indented row in the sidebar already allows. */
  onDoubleClick?: () => void;
  /** Extra context-menu items specific to the current selection state - "Objekte gruppieren" for
   * a multi-block selection, "Gruppe auflösen" for a group selection (see Canvas.tsx, which
   * computes these since only it knows the full selection, not any one block in isolation).
   * Rendered above the generic layer/delete items below, separated by a divider. */
  extraMenuItems?: ContextMenuItem[];
  /** Whether this block is already part of whatever the CURRENT selection is (a single block
   * match, or a member of the active multi-block/group selection) - when true, right-clicking it
   * opens the context menu against that existing selection as-is, instead of first collapsing it
   * down to just this one block the way a context-menu click normally also selects its target. A
   * right-click on an already-multi-selected/grouped block needs its menu to offer "Objekte
   * gruppieren"/"Gruppe auflösen" against the WHOLE existing selection, not whatever selecting
   * just this one block would narrow it down to. */
  isPartOfCurrentSelection?: boolean;
}

export function BlockView({
  block,
  selected,
  locked,
  onSelect,
  onUpdate,
  onDelete,
  onBringToFront,
  onSendToBack,
  siblingPositions = [],
  livePositionOverride,
  groupSelected,
  marqueeHover,
  onShiftSelect,
  onDoubleClick,
  extraMenuItems,
  isPartOfCurrentSelection,
}: BlockViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [liveOverride, setLiveOverride] = useState<BlockPosition | null>(null);
  // The waypoints of an arrow while one is being dragged (see ArrowHandles).
  const [livePoints, setLivePoints] = useState<ArrowPoint[] | null>(null);
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const [nearEdge, setNearEdge] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const contextMenu = useContextMenu();
  const placeholderProblems = usePlaceholderProblems(block);
  const viewers = useBlockViewers(block.id);
  const position = livePositionOverride ?? liveOverride ?? block.position;
  // An image, video, iframe or formula has no inner content worth preserving access to on the canvas
  // (unlike text/quiz - and an iframe's own content is non-interactive here anyway, see
  // .weft-edit-block-iframe-wrap iframe's pointer-events:none in App.css), so it can be grabbed
  // and moved from anywhere - including on the very first click, before it's even selected, see
  // handlePointerDownMove/handlePointerMoveHover below.
  const isFreelyMovableBlock = block.kind === "language" || block.kind === "tex" || block.kind === "image" || block.kind === "video" || block.kind === "iframe" || block.kind === "shape" || block.kind === "arrow";
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
  // iframe/quiz) from at all. Capping it at a fraction of the block's own true (unrotated) size
  // guarantees a real interior for any reasonably-sized block, while leaving it unchanged for
  // normal-sized ones. Measured against the block's own true width/height (position percentages
  // times the stage's own size), not a post-rotation DOM rect - see edgeDistancePx's own doc
  // comment in resizeMath.ts for why that distinction matters.
  function edgeThreshold(pos: BlockPosition, stage: DOMRect): number {
    const widthPx = (pos.width / 100) * stage.width;
    const heightPx = (pos.height / 100) * stage.height;
    return Math.min(EDGE_GRAB_PX, widthPx * 0.3, heightPx * 0.3);
  }

  function handlePointerDownMove(e: ReactPointerEvent) {
    if (locked) return;
    // Right-click (button 2, e.g. to open the context menu below) and middle-click both fire a
    // pointerdown same as a real drag would - without this a right-click on a freely-movable
    // block (image/video/iframe, draggable from anywhere, see isFreelyMovableBlock) shoved it
    // around under the cursor on the way to opening the menu, since nothing here checked which
    // button was actually held.
    if (e.button !== 0) return;
    // While this block is part of the active group/multi-selection, dragging moves the whole
    // selection together - back off (before preventDefault/stopPropagation below) so the
    // pointerdown bubbles up to Canvas's own stage-level group-drag handler instead of starting
    // this block's own solo drag.
    if (groupSelected) return;
    // A freely-movable block can start a drag from the very first pointerdown, even before it's
    // selected - handleMove below selects it as soon as the drag threshold is crossed. Any other
    // kind still needs a prior click to select it first, since only then does clicking near its
    // edge (rather than its interior, reserved for text selection/interacting with the block)
    // mean "move", not "select".
    if (!selected && !isFreelyMovableBlock) return;
    if (!isFreelyMovableBlock) {
      const stage = stageRect();
      if (!stage || edgeDistancePx(e.clientX, e.clientY, position, stage) > edgeThreshold(position, stage)) return;
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
      // Smart guides only make sense against the block's own un-rotated box - once it's rotated,
      // CSS spins it around its center and the edges this math would snap no longer line up with
      // what's actually drawn on screen, so skip it rather than show a guide in the wrong place.
      if (!startPosition.rotation) {
        const snap = snapMove(committed, siblingPositions, stage!);
        committed = snap.position;
        setSnapGuides({ x: snap.guideX, y: snap.guideY });
      }
      setLiveOverride(committed);
    }

    function finish() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      if (started) onUpdate?.({ position: committed });
      setLiveOverride(null);
      setSnapGuides({ x: null, y: null });
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
    const stage = stageRect();
    if (!stage) return;
    setNearEdge(edgeDistancePx(e.clientX, e.clientY, position, stage) <= edgeThreshold(position, stage));
  }

  function handleResizeStart(handle: HandleId, e: ReactPointerEvent) {
    if (e.button !== 0) return;
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
      // Same reasoning as the move-drag's own snapping (see handlePointerDownMove): a rotated
      // block's dragged edge no longer lines up with its unrotated x/y/width/height, so skip it
      // rather than snap - and show a guide - somewhere that doesn't match what's on screen.
      if (!startPosition.rotation) {
        const snap = usesProportionalResize
          ? snapCornerResize(committed, startPosition, handle as CornerHandleId, siblingPositions, stage!)
          : snapResize(committed, HANDLES.find((h) => h.id === handle)!.edges, siblingPositions, stage!);
        committed = snap.position;
        setSnapGuides({ x: snap.guideX, y: snap.guideY });
      }
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
      setSnapGuides({ x: null, y: null });
    }

    // Fix the cursor to this handle's resize direction for the whole drag - otherwise a fast
    // pointer move off the (8px) handle would fall back to the default arrow mid-drag.
    document.body.style.cursor = RESIZE_CURSORS[handle];
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  // Portaled straight into the stage element (this block's own DOM parent) rather than rendered
  // as a normal child here - a guide has to span the whole slide and stay fixed at the matched
  // candidate's position, not move along with (or be clipped by) this block's own, currently-
  // dragged, absolutely-positioned box.
  const stageEl = wrapRef.current?.parentElement ?? null;
  const guides =
    stageEl &&
    (snapGuides.x !== null || snapGuides.y !== null) &&
    createPortal(
      <>
        {snapGuides.x !== null && <div className="weft-snap-guide weft-snap-guide-v" style={{ left: `${snapGuides.x}%` }} />}
        {snapGuides.y !== null && <div className="weft-snap-guide weft-snap-guide-h" style={{ top: `${snapGuides.y}%` }} />}
      </>,
      stageEl,
    );

  return (
    <>
      <div
        ref={wrapRef}
        className={
          "weft-edit-block" +
          (selected ? " is-selected" : "") +
          (groupSelected ? " is-group-selected" : "") +
          (marqueeHover ? " is-marquee-hover" : "") +
          (locked ? " is-locked" : "") +
          (nearEdge ? " is-near-edge" : "")
        }
        style={style}
        onClick={(event) => {
          if (locked) return;
          event.stopPropagation();
          if (event.shiftKey && onShiftSelect) onShiftSelect();
          else onSelect?.();
        }}
        onDoubleClick={(event) => {
          if (locked) return;
          // A formula opens its editing dialog - except for a not-yet-entered group member, where
          // the first double-click still means "enter the group" (see onDoubleClick's own doc
          // comment); once entered the block is selected, so the next one opens the dialog.
          if (block.kind === "tex" && (selected || !onDoubleClick)) {
            event.stopPropagation();
            useTexDialog.getState().open(block.id);
            return;
          }
          if (!onDoubleClick) return;
          event.stopPropagation();
          onDoubleClick();
        }}
        onContextMenu={(event) => {
          if (locked || (!onDelete && !onBringToFront && !onSendToBack && !extraMenuItems?.length)) return;
          // A quiz block's own question/options area opens its own, more specific menu instead
          // (see QuizBlockCanvas) - stopPropagation there keeps this one from also firing, so this
          // only ever fires for the parts of a quiz block outside that (its padding, the submit-
          // button preview) or for any other kind of block, where it's the only menu there is.
          // Already part of the current selection (a multi-block/group one) - right-clicking it
          // should open the menu against that WHOLE selection, not first collapse it down to just
          // this one block the way a plain onSelect would.
          if (!isPartOfCurrentSelection) onSelect?.();
          const layerItems = layerMenuItems(onBringToFront, onSendToBack, onDelete);
          const items =
            extraMenuItems && extraMenuItems.length > 0
              ? layerItems.length > 0
                ? [...extraMenuItems, { separator: true } as const, ...layerItems]
                : extraMenuItems
              : layerItems;
          contextMenu.open(event, items);
        }}
        onPointerDown={handlePointerDownMove}
        onPointerMove={handlePointerMoveHover}
        onPointerLeave={() => setNearEdge(false)}
      >
        <div className={"weft-edit-block-inner" + (block.kind === "shape" || block.kind === "arrow" ? " weft-edit-block-inner-shape" : "")}>
          <BlockContent
            block={block.kind === "arrow" && livePoints ? { ...block, points: livePoints } : block}
            selected={selected}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
          />
        </div>
        {placeholderProblems.length > 0 && !locked && (
          // Next to the block, not in it: a {{variable}} that won't be evaluated when played (see
          // findPlaceholderProblems) - the text itself stays exactly as the author typed it.
          <div className="weft-edit-block-warning" title={placeholderProblems.join("\n")}>
            ⚠
          </div>
        )}
        {viewers.length > 0 && (
          // Somebody else has this block selected: a frame in their colour, with their name on it.
          <div className="weft-remote-selection" style={{ borderColor: presenceColor(viewers[0].peerId) }}>
            <span className="weft-remote-selection-name" style={{ background: presenceColor(viewers[0].peerId) }}>
              {viewers[0].avatar && <img className="weft-remote-selection-avatar" src={viewers[0].avatar} alt="" draggable={false} />}
              {viewers.map((v) => v.name).join(", ")}
            </span>
          </div>
        )}
        {selected && !locked && !groupSelected && block.kind === "arrow" && (
          <ArrowHandles
            block={livePoints ? { ...block, points: livePoints } : block}
            slideAspect={slideAspect}
            stageRect={stageRect}
            onLive={setLivePoints}
            onCommit={(patch) => onUpdate?.(patch)}
          />
        )}
        {selected &&
          !locked &&
          !groupSelected &&
          (usesProportionalResize ? CORNER_HANDLES : HANDLES).map((h) => (
            <div
              key={h.id}
              className={`weft-resize-handle weft-resize-handle-${h.id}`}
              onPointerDown={(e) => handleResizeStart(h.id, e)}
            />
          ))}
      </div>
      {guides}
      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.close} />
    </>
  );
}

function BlockContent({
  block,
  selected,
  onUpdate,
  onDelete,
  onBringToFront,
  onSendToBack,
}: {
  block: Block;
  selected: boolean;
  onUpdate?: (patch: Partial<Block>) => void;
  onDelete?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
}) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  // The language texts are shown and edited in (null: the module has none) - see useEditingLanguage.
  const { lang, defaultLang } = useEditingLanguage();

  switch (block.kind) {
    case "text":
      return (
        <EditableRichText
          className={"weft-edit-block-text" + (block.scrollable ? " is-scrollable" : "")}
          html={textHtml(block, lang, defaultLang)}
          editable={selected}
          onCommit={(html) => onUpdate?.(textHtmlPatch(block, lang, defaultLang, html))}
        />
      );
    case "language":
      // What a learner will get: a drop-down showing the current language by its own name. Inert here
      // (see isFreelyMovableBlock) - the real one lives in the player.
      return (
        <div className="weft-edit-block-language">
          {lang ? autonymLabel(lang) : "🌐"}
          <span aria-hidden>▾</span>
        </div>
      );
    case "code":
      return <CodeView block={block} editable={selected} onCommit={(code) => onUpdate?.({ code })} />;
    case "tex":
      return <TexView tex={block.tex} color={block.color} />;
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
          {buttonText(block, lang, defaultLang) || playerStringsFor(lang).next}
        </button>
      );
    case "quiz":
      return (
        <QuizBlockCanvas
          block={block}
          selected={selected}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onBringToFront={onBringToFront}
          onSendToBack={onSendToBack}
        />
      );
    case "shape":
      return <ShapeSvg block={block} />;
    case "arrow":
      return <ArrowSvg block={block} />;
  }
}

/**
 * The quiz question/options, directly editable and manageable right on the canvas - unlike the
 * sidebar's own QuizEditor (BlockPanel.tsx, still there for the same actions from a fixed spot),
 * this is where an author actually looks while laying a question out, so it gets its own
 * interactions instead of forcing a trip to the sidebar for every tweak:
 *  - the "checkbox" is a real button now, toggling whether that option counts as correct;
 *  - a trash icon at each row's right edge deletes it, after a short confirmation (unlike the
 *    sidebar's own "×", which is already tucked away enough not to need one - this sits in the
 *    open, right next to text you might click while just reading it);
 *  - right-clicking anywhere on the block (or right on a row, for an extra "delete this one") add
 *    a new option via the app's regular context menu, mirroring how the slide list already
 *    handles add/remove (see Sidebar.tsx).
 */
function QuizBlockCanvas({
  block,
  selected,
  onUpdate,
  onDelete,
  onBringToFront,
  onSendToBack,
}: {
  block: QuizBlock;
  selected: boolean;
  onUpdate?: (patch: Partial<Block>) => void;
  onDelete?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
}) {
  const contextMenu = useContextMenu();
  const { lang, defaultLang } = useEditingLanguage();
  // Right-clicking anywhere on a quiz block opens ITS OWN, more specific menu (option add/
  // remove) instead of letting the click bubble up to BlockView's generic "Löschen"/layer-order
  // one - so those have to be offered here too, tacked onto both of this component's own menus, or
  // a quiz block would have no on-canvas way to remove or reorder itself at all.
  const layerItems = layerMenuItems(onBringToFront, onSendToBack, onDelete, "Objekt löschen");
  const deleteBlockItems: ContextMenuItem[] = layerItems.length > 0 ? [{ separator: true }, ...layerItems] : [];

  function addOption() {
    onUpdate?.({ options: [...block.options, { id: createId(), html: "Neue Option" }] });
  }

  function removeOption(optionId: string) {
    onUpdate?.({
      options: block.options.filter((o) => o.id !== optionId),
      correctOptionIds: block.correctOptionIds.filter((id) => id !== optionId),
    });
  }

  async function removeOptionWithConfirm(optionId: string) {
    if (await confirmDestructive("Wirklich löschen?", "Antwortoption löschen")) removeOption(optionId);
  }

  return (
    <div
      className="weft-edit-block-quiz"
      onContextMenu={(e) => contextMenu.open(e, [{ label: "+ Antwortoption hinzufügen", onClick: addOption }, ...deleteBlockItems])}
    >
      <EditableRichText
        className="weft-edit-block-quiz-question"
        html={quizQuestionHtml(block, lang, defaultLang)}
        editable={selected}
        autoFocus={false}
        onCommit={(html) => onUpdate?.(quizQuestionPatch(block, lang, defaultLang, html))}
      />
      <div className="weft-edit-block-quiz-options">
        {block.options.map((opt) => {
          // The editor shows the AUTHOR's own ground truth (which option(s) are marked correct)
          // as an authoring aid - unlike the player, which starts every option unchecked since
          // the learner hasn't answered yet (see player.runtime.js).
          const isCorrect = block.correctOptionIds.includes(opt.id);
          return (
            <div
              key={opt.id}
              className={"weft-edit-block-quiz-option" + (isCorrect ? " is-correct" : "")}
              onContextMenu={(e) =>
                contextMenu.open(e, [
                  { label: "+ Antwortoption hinzufügen", onClick: addOption },
                  { separator: true },
                  { label: "Antwortoption löschen", danger: true, onClick: () => removeOption(opt.id) },
                  ...deleteBlockItems,
                ])
              }
            >
              <button
                type="button"
                className="weft-edit-block-quiz-option-checkbox"
                title={isCorrect ? "Als falsch markieren" : "Als richtig markieren"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const correctOptionIds = isCorrect
                    ? block.correctOptionIds.filter((id) => id !== opt.id)
                    : [...block.correctOptionIds, opt.id];
                  onUpdate?.({ correctOptionIds });
                }}
                dangerouslySetInnerHTML={{ __html: isCorrect ? checkboxCheckedSvg : checkboxUncheckedSvg }}
              />
              <EditableRichText
                className="weft-edit-block-quiz-option-text"
                html={quizOptionHtml(block, opt.id, lang, defaultLang)}
                editable={selected}
                autoFocus={false}
                onCommit={(html) => onUpdate?.(quizOptionPatch(block, opt.id, lang, defaultLang, html))}
              />
              <button
                type="button"
                className="weft-edit-block-quiz-option-delete"
                title="Antwortoption löschen"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void removeOptionWithConfirm(opt.id)}
                dangerouslySetInnerHTML={{ __html: trashIconSvg }}
              />
            </div>
          );
        })}
      </div>
      <div className="weft-edit-block-quiz-submit">
        <span className="weft-edit-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
        {playerStringsFor(lang).submit}
      </div>
      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.close} />
    </div>
  );
}

/**
 * Renders the actual embedded page - always at a virtual, fixed pixel WIDTH (so the embedded
 * page's own media queries/JS see a constant "window" width no matter how large the module itself
 * is displayed, e.g. to force its mobile layout), never just "whatever size the block happens to
 * render at" (there'd be no way to predict what the embedded page looks like, since it'd reflow
 * differently depending on how the module is displayed). Height is DERIVED, not separately
 * configured, from the wrap's own aspect ratio times that width, so the virtual viewport always
 * has exactly the block's own shape and the scaled result fills it edge to edge with no
 * letterboxing.
 *
 * Both the derived height AND the scale factor that fits the fixed-width iframe into the wrap
 * used to be computed live in CSS via container query units (`100cqh / 100cqw` for the height,
 * `100cqw / <width>` for the scale) - that worked in Chromium/WebKit but isn't portable: Firefox
 * rejects a `calc()` that divides one length by another as an invalid value outright, for *both*
 * of those (confirmed via its DevTools: "Ungültiger Wert für Eigenschaft" on each), silently
 * dropping the whole declaration. `width`, a plain literal, still applied - so the iframe rendered
 * at exactly the right width but fell back to the browser's default ~150px height and a 1:1
 * (unscaled) transform, exactly the "correctly wide, much too short" bug this was fixed for. The
 * height is derived in JS now instead (the block's width/height percentages and the module's own
 * aspect ratio are already known data here, no container query needed for it at all); the scale
 * factor still genuinely needs the wrap's own rendered pixel width, which isn't known until
 * layout, so that's measured via ResizeObserver instead of computed via calc().
 */
// Kept in sync by hand with BlockPanel.tsx's DEFAULT_VIEWPORT_WIDTH and player.runtime.js's own
// copy (a module saved before this field existed has no forcedViewportWidth at all, and unlike
// most such fallbacks this one can't just mean "off" - a virtual viewport is always in effect
// now, see IframeEditor's comment for why - so it needs an actual width to fall back to).
const DEFAULT_VIEWPORT_WIDTH = 768;

function IframeFrame({ block }: { block: IframeBlock }) {
  const aspectRatio = useDocumentStore((s) => s.doc.content.aspectRatio);
  const width = block.forcedViewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
  const stageHeightOverWidth = 1 / aspectRatioNumeric(aspectRatio);
  const wrapHeightOverWidth = stageHeightOverWidth * (block.position.height / block.position.width);
  const height = width * wrapHeightOverWidth;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setScale(rect.width / width);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div className="weft-edit-block-iframe-viewport-wrap" ref={wrapRef}>
      <iframe
        src={block.url}
        sandbox={block.sandbox.join(" ")}
        title="Eingebetteter Inhalt"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

/**
 * Directly editable on the canvas (true WYSIWYG) - contentEditable while `editable`, so a click
 * that selects the block also drops a cursor into it, ready to type. Its own DOM is left alone by
 * React while focused (uncontrolled) so the browser's native editing/cursor state doesn't fight
 * React's re-renders; `html` is only re-applied when it changed for a reason other than this
 * component's own last commit - undo/redo, another instance, first mount - tracked via
 * lastKnownHtml rather than just "not focused", since focus can outlast an edit (the toolbar's
 * controls restore it, and nothing forces a blur just because the user clicked Undo), and
 * skipping the resync there would let a later blur re-commit that stale, already-undone content,
 * silently undoing the undo. Written back via onCommit on blur or via richText.ts's applyFormat
 * (the sidebar's formatting buttons never actually take focus away from here - see
 * BlockPanel.tsx). One instance is one editable region: a TextBlock has exactly one filling the
 * whole block, but a QuizBlock has several side by side (the question, each option) - richText.ts
 * itself doesn't care, since "the active editable" is just whichever instance last got focus.
 */
function EditableRichText({
  className,
  html,
  editable,
  autoFocus = true,
  onCommit,
}: {
  className: string;
  html: string;
  editable: boolean;
  /** Focus this region the moment it becomes editable - right for a TextBlock (its one region
   * IS the whole block, so selecting the block should drop you straight into typing) but wrong
   * once several regions share a block (QuizBlock) - autofocusing all of them at once would just
   * mean whichever rendered last silently wins, so those instead wait for an explicit click. */
  autoFocus?: boolean;
  onCommit: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // null (never a real value once committed/synced) so the very first effect run below always
  // syncs the initial content into the DOM, instead of comparing html to itself and concluding
  // there's nothing to do.
  const lastKnownHtml = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || html === lastKnownHtml.current) return;
    // `html` also changes when somebody else edits this very text. If the person at this keyboard has
    // typed something that isn't committed yet (committing happens when the region loses focus), that
    // text stays - replacing it under their fingers would eat their typing and throw the caret to
    // the start - and it becomes the new version when it is committed.
    if (document.activeElement === el && el.innerHTML !== lastKnownHtml.current) return;
    el.innerHTML = html;
    lastKnownHtml.current = html;
  }, [html]);

  useEffect(() => {
    if (editable && autoFocus) ref.current?.focus();
  }, [editable, autoFocus]);

  function commit(nextHtml: string) {
    // Guard explicitly rather than relying on edit()'s own no-op detection upstream - blur fires
    // on every click into the sidebar toolbar (each control hands focus back afterwards), so
    // without this an unrelated formatting action, or even just clicking into the text and back
    // out without typing, would commit identical content as a spurious extra undo step - which
    // then falls in front of the real edit being undone, making Undo look like it did nothing.
    if (nextHtml === lastKnownHtml.current) return;
    lastKnownHtml.current = nextHtml;
    onCommit(nextHtml);
  }

  return (
    <div
      ref={ref}
      className={className}
      contentEditable={editable}
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
