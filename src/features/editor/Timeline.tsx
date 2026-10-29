import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import gearIconSvg from "../../../mockups/icons/admin.svg?raw";

const conditionIconSvg =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h12M4 12h6M4 17h8"/><path d="M14 15l2.5 2.5L21 12"/></svg>';
import playIconSvg from "../../../mockups/icons/play.svg?raw";
import arrowRightIconSvg from "../../../mockups/icons/arr_1right.svg?raw";
import acceptIconSvg from "../../../mockups/icons/accept.svg?raw";
import declineIconSvg from "../../../mockups/icons/decline.svg?raw";
import hand2IconSvg from "../../../mockups/icons/hand2.svg?raw";
import cursorIconRaw from "../../../mockups/icons/cursor.svg?raw";
import video2IconSvg from "../../../mockups/icons/video2.svg?raw";
import stopIconSvg from "../../../mockups/icons/stop.svg?raw";
import infoIconSvgRaw from "../../../mockups/icons/info-circle-full.svg?raw";
import animationIconSvgRaw from "../../../mockups/icons/animation.svg?raw";
import dashingAwayIconSvgRaw from "../../../mockups/icons/dashing-away.svg?raw";
import { reorderChain } from "../../core/document/actions";
import { isChainOrderAllowed, isTriggerableNode, listAllNodes } from "../../core/document/pageTimeline";
import { eventLookOf } from "../../core/blocks/registry";
import type { EventIconName } from "../../core/blocks/types";
import { findChain } from "../../core/eventGraph/chains";
import { useDocumentStore } from "../../core/document/store";
import { stopPointIconSvg } from "./stopPointIcon";
import { buildGraphModel } from "./eventGraph/model";
import type { EventColor, GraphNodeModel } from "./eventGraph/model";
import { layoutGraph } from "./eventGraph/layout";
import type { EdgeRoute } from "./eventGraph/layout";
import { TRANSITION_LABELS } from "../../core/document/transitions";
import type { Page, TimelineEventType, TimelineNode } from "../../core/types";
import { tr } from "../../core/i18n/tr";


// This icon sets its colour in a style attribute, which the colour of an event (see App.css) can't reach: as a fill attribute
// it takes the colour of the event like the others do.
const animationIconSvg = animationIconSvgRaw.replace(/style="fill:[^"]*"/g, 'fill="#28497c"');
// The same for the icon of an Abbau (its path carries the fill in a style attribute, together with a fill-rule).
const dashingAwayIconSvg = dashingAwayIconSvgRaw.replace(/style="fill:[^;"]*;fill-rule:nonzero;"/g, 'fill="#28497c" fill-rule="nonzero"');

// No icon file for this in the set (see mockups/icons) - a plain "∞" glyph, drawn as an <svg
// text> so it slots into TimelineNodeIcon exactly like every other, file-based icon here (same
// dangerouslySetInnerHTML path, same currentColor fill via the CSS in App.css).
const INFINITY_ICON_SVG =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="8" y="12" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#28497c">∞</text></svg>';

// The info icon takes the colour of the event like the others do (its own colour is a fill in the file).
const infoIconSvg = infoIconSvgRaw.replace(/fill="[^"]*"/g, 'fill="#28497c"').replace(/style="fill:[^"]*"/g, 'fill="#28497c"');

// An Aktionseffekt: a way with a dot at its end (move), vibration marks beside a box (shake), rays around a point (blink).
const moveActionIconSvg =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#28497c" stroke-width="1.5" stroke-linecap="round"><path d="M2 12 C5 12 5 4 11 4" stroke-dasharray="0.1 2.6"/><circle cx="12" cy="4" r="2" fill="#28497c" stroke="none"/></svg>';
const shakeActionIconSvg =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#28497c" stroke-width="1.5" stroke-linecap="round"><rect x="5" y="4" width="6" height="8" rx="1" fill="#28497c" stroke="none"/><path d="M2.5 5.5 L2.5 10.5 M13.5 5.5 L13.5 10.5 M0.8 7 L0.8 9 M15.2 7 L15.2 9"/></svg>';
const blinkActionIconSvg =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#28497c" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.2" fill="#28497c" stroke="none"/><path d="M8 1.5 V3.5 M8 12.5 V14.5 M1.5 8 H3.5 M12.5 8 H14.5 M3.4 3.4 L4.8 4.8 M11.2 11.2 L12.6 12.6 M12.6 3.4 L11.2 4.8 M4.8 11.2 L3.4 12.6"/></svg>';

// The titles of the events the editor itself gives the page (the others are the descriptors' and the effects': eventLookOf in core/blocks/registry.ts).
const EVENT_LABELS: Partial<Record<TimelineEventType, string>> = {
  get "variable-condition"() { return tr("ui.condition_event_label"); },
  get "block-action-move"() { return tr("ui.action_move_event"); },
  get "block-action-shake"() { return tr("ui.action_shake_event"); },
  get "block-action-blink"() { return tr("ui.action_blink_event"); },
};

// The cursor (cursor.svg) has its colour fixed in the file; the graph colours its icons itself (currentColor, see App.css). It is cut to its
// drawing (the file has a margin around it) and drawn larger than the other icons (.weft-cursor-icon in App.css): at their size it is too small to read.
const cursorIconSvg = cursorIconRaw
  .replace(/fill:rgb\([^)]*\);/, "")
  .replace('viewBox="0 0 50 50"', 'viewBox="5.7 2 35 46" class="weft-cursor-icon"');

// The icons by the name the descriptors give them (EventIconName in core/blocks/types.ts).
const ICONS: Record<EventIconName, string> = {
  cursor: cursorIconSvg,
  accept: acceptIconSvg,
  decline: declineIconSvg,
  video: video2IconSvg,
  play: playIconSvg,
  // Same icon VideoStopPointDialog's own mini-timeline markers use (see panels/BlockPanel.tsx) -
  // so a stop point reads as the same thing whether you're looking at it there or here.
  "stop-point": stopPointIconSvg(true),
  infinity: INFINITY_ICON_SVG,
  stop: stopIconSvg,
  info: infoIconSvg,
  hand: hand2IconSvg,
  gear: gearIconSvg,
  animation: animationIconSvg,
  "dashing-away": dashingAwayIconSvg,
};

// The icons of the events the editor itself gives the page (Aufbau and Abbau have theirs in ICONS: the animation and the dashing away).
const EVENT_ICONS: Partial<Record<TimelineEventType, string>> = {
  // A condition of a variable that came true: lines and a tick.
  "variable-condition": conditionIconSvg,
  "block-action-move": moveActionIconSvg,
  "block-action-shake": shakeActionIconSvg,
  "block-action-blink": blinkActionIconSvg,
};

/** Exported for BlockEffectEditor in panels/BlockPanel.tsx, which lists these same nodes (minus
 * "end" - see BlockEffect.triggerEventId in core/types.ts) as trigger options for a block's own
 * Aufbau/Abbau, and wants them to read exactly the same as they do here. */
/** The title of an event in the graph: the one the author gave it, else its standard one (see nodeLabel). */
export function eventTitle(page: Page, node: TimelineNode): string {
  return page.timeline.titles?.[node.id]?.trim() || nodeLabel(node);
}

export function nodeLabel(node: TimelineNode): string {
  if (node.label) return node.label;
  if (node.kind === "start") return tr("ui.start_of_the_slide");
  if (node.kind === "end") return tr("ui.next_slide");
  if (node.kind === "event" && node.eventType) return EVENT_LABELS[node.eventType] ?? eventLookOf(node.eventType)?.label() ?? "";
  return "";
}

/** Every node on the page that could be picked as a trigger SOURCE (BlockPanel.tsx's own Aufbau/
 * Abbau dropdowns, EventPanel.tsx's "Ausgelöst durch") - everything except "end" (Nächste Folie),
 * which is excluded because the slide is already gone by the time it fires. Includes triggerable
 * nodes (block-entrance/-exit, video-start) too - one block's Aufbau can chain onto another's, or
 * onto a video's start, exactly like any other event (see syncPageTimelineEvents in
 * document/pageTimeline.ts for how that's resolved regardless of block order). */
export function listPageTriggerEvents(page: Page): { id: string; label: string }[] {
  return listAllNodes(page)
    // (The condition of an event - "Ausgelöst durch: Variable" - is part of that event's own trigger, not a source to pick for another.)
    .filter((node) => node.kind !== "end" && node.eventType !== "variable-condition")
    .map((node) => ({ id: node.id, label: eventTitle(page, node) }));
}

/** Every node that could be picked as a trigger TARGET (see TRIGGERABLE_EVENT_TYPES in
 * document/pageTimeline.ts) - the options EventPanel.tsx's own "Löst aus" offers when adding a
 * new outgoing trigger. */
export function listTriggerableNodes(page: Page): { id: string; label: string }[] {
  return listAllNodes(page)
    .filter(isTriggerableNode)
    .map((node) => ({ id: node.id, label: eventTitle(page, node) }));
}

/** The name of the transition of a "Nächste Folie" event, or nothing for a plain cut. */
function endTransitionLabel(page: Page, endId: string): string {
  const type = page.timeline.ends[endId]?.transition.type ?? "none";
  return type === "none" ? "" : TRANSITION_LABELS[type];
}

// Sizes of the drawing, in pixels.
const ICON = 26;
const COLUMN_MIN = 92;
const ROW_HEIGHT = 90;
const PAD_X = 34;
const PAD_TOP = 14;
const FRAME_PAD = 12;
/** More room above a frame, for the name of the block. */
const FRAME_TOP = 22;
const LABEL_HEIGHT = 34;
/** The lock where the lines of the required tasks end (diameter). */
const LOCK = 20;
/** How long the line of a task that is no longer required takes to fade out. */
const FADE_MS = 260;

/** The lines of the required tasks as they are drawn (see conditionGeometry in TimelineGraph). */
type ConditionGeometry = { lock: Point; paths: { id: string; d: string; drawD: string }[] };

interface Point {
  x: number;
  y: number;
}

/** A line through `points` with rounded corners. */
function roundedPath(points: Point[], radius: number): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const toPrev = Math.hypot(prev.x - cur.x, prev.y - cur.y);
    const toNext = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, toPrev / 2, toNext / 2);
    const before = { x: cur.x + ((prev.x - cur.x) / toPrev) * r, y: cur.y + ((prev.y - cur.y) / toPrev) * r };
    const after = { x: cur.x + ((next.x - cur.x) / toNext) * r, y: cur.y + ((next.y - cur.y) / toNext) * r };
    d += ` L ${before.x} ${before.y} Q ${cur.x} ${cur.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** The line of one trigger from `u` to `v` (centres of the two icons). `detourY`: where a detour runs, below the graph. */
function edgePath(route: EdgeRoute, u: Point, v: Point, columnWidth: number, detourY: number): string {
  const half = ICON / 2;
  const uHalf = half;
  const vHalf = half;
  if (route === "straight") return `M ${u.x + uHalf} ${u.y} L ${v.x - vHalf} ${v.y}`;
  if (route === "vertical") {
    // Under the icon and its label, straight down into the one below.
    return `M ${u.x} ${u.y + half + LABEL_HEIGHT} L ${v.x} ${v.y - half}`;
  }
  if (route === "down") {
    // Right, then down in the gap between the columns, then right again into the event from the left.
    const gap = u.x + Math.min(columnWidth / 2, uHalf + 34);
    return roundedPath(
      [
        { x: u.x + uHalf, y: u.y },
        { x: gap, y: u.y },
        { x: gap, y: v.y },
        { x: v.x - vHalf, y: v.y },
      ],
      9,
    );
  }
  // A detour: leaves at 45° (down and right), runs along the bottom and comes back at 45° from below left.
  const drop = detourY - u.y;
  const rise = detourY - v.y;
  return roundedPath(
    [
      { x: u.x + uHalf, y: u.y },
      { x: u.x + uHalf + drop, y: detourY },
      { x: v.x - vHalf - rise, y: detourY },
      { x: v.x - vHalf, y: v.y },
    ],
    14,
  );
}

/** How long things take to move into place, in milliseconds. */
const MOVE_MS = 280;
/** How long a new event takes to appear and a new trigger to be drawn. */
const APPEAR_MS = 380;
/** How long one stretch of new lines takes to be drawn; the stretches follow one another, left to right. */
const DRAW_MS = 320;
const DRAG_THRESHOLD_PX = 5;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The positions events are drawn at: `target`, but when it changes they slide there (so that an event pushed aside by a new one moves
 * instead of jumping). New events are put at their place at once (they scale in instead - see Timeline), those in `immediate` (the one
 * being dragged) follow their target without delay, and with `instant` or a preference for reduced motion nothing slides at all.
 */
function useAnimatedPositions(target: Map<string, Point>, immediate: Set<string>, instant: boolean): Map<string, Point> {
  const [shown, setShown] = useState<Map<string, Point>>(target);
  const shownRef = useRef(shown);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const current = shownRef.current;
    const from = new Map<string, Point>();
    const settled = new Map<string, Point>();
    let moving = false;
    for (const [id, to] of target) {
      const was = current.get(id);
      if (!was || immediate.has(id) || instant || prefersReducedMotion()) {
        settled.set(id, to);
        continue;
      }
      from.set(id, was);
      if (was.x !== to.x || was.y !== to.y) moving = true;
    }
    const apply = (positions: Map<string, Point>) => {
      shownRef.current = positions;
      setShown(positions);
    };
    if (!moving) {
      const next = new Map(settled);
      for (const [id, to] of target) if (!next.has(id)) next.set(id, to);
      apply(next);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / MOVE_MS);
      const e = easeOut(t);
      const next = new Map(settled);
      for (const [id, a] of from) {
        const b = target.get(id)!;
        next.set(id, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
      }
      apply(next);
      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // The target is a new map whenever something about the layout changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return shown;
}

/**
 * Renders a page's event graph (see docs/event-graph.md). A page switch starts a fresh graph (nothing slides in from the other
 * page's positions).
 */
export function Timeline({ page }: { page: Page }) {
  return <TimelineGraph key={page.id} page={page} />;
}

/**
 * The graph of one page: the events as round icons with their titles, the triggers as lines. What the graph is made of comes from
 * buildGraphModel (the events of the page's blocks, its triggers); where everything stands from layoutGraph; this component turns
 * that into pixels - and moves it:
 *
 * - Colour says what kind of event it is: blue is the normal kind, yellow an animation (Aufbau, Abbau, a transition), violet
 *   something the learner does; red an event nothing can make happen.
 * - A line is dashed when it waits for the learner (Weiter), solid when it happens by itself - with its delay written on it.
 * - A line that can't run to the right or down (back in time, or in from below) is drawn faint, as a detour behind everything.
 * - A quiz and a video are event blocks: their events share a frame.
 * - Hovering an event lifts it and its lines and dims the rest.
 * - When something changes, events slide to their new place, a new event grows into view and a new line is drawn from its source
 *   to its target.
 * - Animations that follow each other one by one (a chain) can be put in another order by dragging one of them along the line;
 *   the delays and waits stay where they are, the events move.
 * Every event selects itself when clicked, routing the Inspector to EventPanel.tsx.
 */
function TimelineGraph({ page }: { page: Page }) {
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const [hovered, setHovered] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  // The event being dragged, and where its pointer is (x, in graph pixels) and the order it would take.
  const [drag, setDrag] = useState<{ nodeId: string; x: number; order: string[] } | null>(null);
  const suppressClickRef = useRef(false);
  // The events of the chain being dragged, in the order they stood in when the drag began.
  const chainIdsRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      setResizing(true);
      setAvailableWidth(el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // A change of width is not a change of the graph: nothing slides for it.
  useLayoutEffect(() => {
    if (!resizing) return;
    const timer = setTimeout(() => setResizing(false), 60);
    return () => clearTimeout(timer);
  }, [resizing, availableWidth]);

  const model = useMemo(() => buildGraphModel(page), [page]);
  const layout = useMemo(
    () =>
      layoutGraph(
        model.nodes.map((n) => ({ id: n.id, isEnd: n.node.kind === "end" })),
        model.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, down: e.down })),
      ),
    [model],
  );

  const columnWidth = layout.cols > 1 ? Math.max(COLUMN_MIN, (availableWidth - 2 * PAD_X) / (layout.cols - 1)) : COLUMN_MIN;
  const detours = layout.edges.filter((e) => e.route === "detour");
  const graphWidth = 2 * PAD_X + (layout.cols - 1) * columnWidth;
  const rowsHeight = PAD_TOP + ICON / 2 + (layout.rows - 1) * ROW_HEIGHT + ICON / 2 + LABEL_HEIGHT;
  // The lock of the required tasks hangs under the title of "Nächste Folie" - room for it, if that stands in the last row.
  const lockRoom = model.conditions.length > 0 && model.conditions.some((c) => (layout.row.get(c.to) ?? 0) >= layout.rows - 1) ? LOCK + 8 : 0;
  const graphHeight = rowsHeight + lockRoom + (detours.length > 0 ? 14 + detours.length * 8 : 0);

  // Where every event stands: its place in the layout - or, while one is being dragged, with the others closed up around it.
  const target = useMemo(() => {
    const positions = new Map<string, Point>();
    for (const n of model.nodes) {
      positions.set(n.id, {
        x: PAD_X + (layout.col.get(n.id) ?? 0) * columnWidth,
        y: PAD_TOP + ICON / 2 + (layout.row.get(n.id) ?? 0) * ROW_HEIGHT,
      });
    }
    if (drag) {
      // The places of the chain, from left to right, are taken in the new order; the dragged event itself follows the pointer.
      const slots = [...drag.order].map((_, i) => positions.get(chainIdsRef.current[i])!).filter(Boolean);
      drag.order.forEach((id, i) => {
        const slot = slots[i];
        if (!slot) return;
        if (id === drag.nodeId) {
          const lo = slots[0].x;
          const hi = slots[slots.length - 1].x;
          positions.set(id, { x: Math.min(hi, Math.max(lo, drag.x)), y: slot.y });
        } else positions.set(id, slot);
      });
    }
    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, layout, columnWidth, drag]);

  const positions = useAnimatedPositions(target, new Set(drag ? [drag.nodeId] : []), resizing);
  const at = (id: string): Point => positions.get(id) ?? target.get(id) ?? { x: PAD_X, y: PAD_TOP };

  // What is new since the last time: it grows into view (events) or is drawn (lines) for a moment. The new lines are drawn one stretch
  // after the other, left to right, as one line being painted: first everything that leads to a new event (the event grows into view
  // when it is reached), then what leads on from it. A stretch is all the new lines that start in the same column.
  type Fresh = { nodes: Set<string>; edges: Set<string>; edgeDelay: Map<string, number>; nodeDelay: Map<string, number> };
  const emptyFresh = (): Fresh => ({ nodes: new Set(), edges: new Set(), edgeDelay: new Map(), nodeDelay: new Map() });
  const seenRef = useRef<{ nodes: Set<string>; edges: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Fresh>(emptyFresh);
  useLayoutEffect(() => {
    const nodes = new Set(model.nodes.map((n) => n.id));
    const edges = new Set(model.edges.map((e) => e.id));
    const previous = seenRef.current;
    seenRef.current = { nodes, edges };
    if (!previous || prefersReducedMotion()) return;
    const addedNodes = new Set([...nodes].filter((id) => !previous.nodes.has(id)));
    const addedEdges = new Set([...edges].filter((id) => !previous.edges.has(id)));
    if (addedNodes.size === 0 && addedEdges.size === 0) return;

    const edgeById = new Map(model.edges.map((e) => [e.id, e]));
    const columns = [...new Set([...addedEdges].map((id) => layout.col.get(edgeById.get(id)!.from) ?? 0))].sort((a, b) => a - b);
    const edgeDelay = new Map<string, number>();
    for (const id of addedEdges) edgeDelay.set(id, columns.indexOf(layout.col.get(edgeById.get(id)!.from) ?? 0) * DRAW_MS);
    // An event appears once the lines into it are drawn.
    const nodeDelay = new Map<string, number>();
    for (const id of addedNodes) {
      let latest = 0;
      for (const edgeId of addedEdges) {
        if (edgeById.get(edgeId)!.to === id) latest = Math.max(latest, (edgeDelay.get(edgeId) ?? 0) + DRAW_MS);
      }
      nodeDelay.set(id, latest);
    }
    setFresh({ nodes: addedNodes, edges: addedEdges, edgeDelay, nodeDelay });
    const total = Math.max(0, ...edgeDelay.values()) + DRAW_MS;
    const timer = setTimeout(() => setFresh(emptyFresh()), Math.max(total, ...nodeDelay.values()) + APPEAR_MS + 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // The lines of the required tasks (see conditionGeometry): a new one is drawn from the task to the lock, which grows into view when it is new
  // as well; one that goes - the task is no longer required, or gone - fades out where it was drawn.
  const conditionsSeenRef = useRef<Set<string> | null>(null);
  const drawnConditionsRef = useRef<ConditionGeometry | null>(null);
  const [freshConditions, setFreshConditions] = useState<{ ids: Set<string>; lock: boolean }>({ ids: new Set(), lock: false });
  const [fadingConditions, setFadingConditions] = useState<{ paths: { id: string; d: string }[]; lock: Point | null } | null>(null);
  useLayoutEffect(() => {
    const ids = new Set(model.conditions.map((c) => c.id));
    const previous = conditionsSeenRef.current;
    conditionsSeenRef.current = ids;
    if (!previous || prefersReducedMotion()) return;
    const added = [...ids].filter((id) => !previous.has(id));
    const removed = [...previous].filter((id) => !ids.has(id));
    // (No cleanup: a change that comes in between must not leave a line half drawn or a faded one standing.)
    if (added.length > 0) {
      setFreshConditions({ ids: new Set(added), lock: previous.size === 0 });
      setTimeout(() => setFreshConditions({ ids: new Set(), lock: false }), DRAW_MS + APPEAR_MS + 80);
    }
    const drawn = drawnConditionsRef.current;
    if (removed.length > 0 && drawn) {
      setFadingConditions({ paths: drawn.paths.filter((p) => removed.includes(p.id)), lock: ids.size === 0 ? drawn.lock : null });
      setTimeout(() => setFadingConditions(null), FADE_MS + 40);
    }
  }, [model]);

  // Events and lines that stay lit while one is hovered: the event itself, its lines and the events at their other ends.
  const hotNodes = new Set<string>();
  const hotEdges = new Set<string>();
  if (hovered && !drag) {
    hotNodes.add(hovered);
    for (const edge of model.edges) {
      if (edge.from === hovered || edge.to === hovered) {
        hotEdges.add(edge.id);
        hotNodes.add(edge.from);
        hotNodes.add(edge.to);
      }
    }
  }
  const lit = hovered !== null && !drag;
  const hotConditions = new Set<string>();
  if (hovered && !drag) for (const c of model.conditions) if (c.from === hovered || c.to === hovered) hotConditions.add(c.id);

  // The frame of every event block: round its events, with the kind of block written on it.
  const frames = new Map<string, { kind: string; ids: string[] }>();
  for (const n of model.nodes) {
    if (!n.blockId || !n.blockKind) continue;
    const frame = frames.get(n.blockId) ?? { kind: n.blockKind, ids: [] };
    frame.ids.push(n.id);
    frames.set(n.blockId, frame);
  }

  function colorOf(n: GraphNodeModel): EventColor | "red" {
    // Unreachable, or (an Aktionseffekt) before the Aufbau or after the Abbau of its block: nothing it could do.
    if (n.unreachable || n.node.problem) return "red";
    // A "Nächste Folie" that animates its transition is an animation.
    if (n.node.kind === "end" && (page.timeline.ends[n.id]?.transition.type ?? "none") !== "none") return "yellow";
    return n.color;
  }

  // The chain an event can be moved in: events that follow each other one by one, in one row.
  function chainOf(nodeId: string): string[] | null {
    const chain = findChain(page.timeline, nodeId, (id) => id.startsWith("block-entrance:") || id.startsWith("block-exit:") || id.startsWith("block-action:") || id.startsWith("list-item:"));
    if (!chain) return null;
    const row = layout.row.get(nodeId);
    if (!chain.nodeIds.every((id) => layout.row.get(id) === row)) return null;
    return chain.nodeIds;
  }
  const draggable = new Set<string>();
  for (const n of model.nodes) if (chainOf(n.id)) draggable.add(n.id);

  function startDrag(event: ReactPointerEvent, nodeId: string) {
    if (event.button !== 0) return;
    const chain = chainOf(nodeId);
    if (!chain) return;
    const graph = (event.currentTarget as HTMLElement).closest(".weft-eg") as HTMLElement | null;
    if (!graph) return;
    const startX = event.clientX;
    const origin = graph.getBoundingClientRect().left;
    let started = false;
    chainIdsRef.current = chain;
    const slotsX = chain.map((id) => PAD_X + (layout.col.get(id) ?? 0) * columnWidth);

    const orderFor = (x: number): string[] => {
      let best = 0;
      for (let i = 0; i < slotsX.length; i++) if (Math.abs(slotsX[i] - x) < Math.abs(slotsX[best] - x)) best = i;
      const others = chain.filter((id) => id !== nodeId);
      others.splice(best, 0, nodeId);
      return others;
    };
    // A place that would put an Aktionseffekt before the Aufbau of its block or after its Abbau is not one: the event stays where it was.
    const allowedOrder = (order: string[]) => (isChainOrderAllowed(order) ? order : chain);
    const move = (e: PointerEvent) => {
      if (!started) {
        if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD_PX) return;
        started = true;
        document.body.classList.add("weft-dragging");
      }
      const x = e.clientX - origin;
      setDrag({ nodeId, x, order: allowedOrder(orderFor(x)) });
    };
    const finish = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove("weft-dragging");
      if (!started) return;
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
      const order = allowedOrder(orderFor(e.clientX - origin));
      setDrag(null);
      if (order.some((id, i) => id !== chain[i])) reorderChain(page.id, order);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  // The required tasks: a dotted violet line from the submission of each to "Nächste Folie", which end together in one lock - under the title
  // of "Nächste Folie" (above its icon when all the tasks stand higher than it). The lines run from the lock towards the tasks, so that the
  // dots of the stretch they share lie on each other; `drawD` is the same line the other way round, along which a new one is drawn.
  function conditionGeometry(): ConditionGeometry | null {
    if (model.conditions.length === 0) return null;
    const half = ICON / 2;
    const to = at(model.conditions[0].to);
    const higher = model.conditions.every((c) => at(c.from).y <= to.y);
    const lock = { x: to.x, y: higher ? to.y - half - LOCK / 2 - 8 : to.y + half + LABEL_HEIGHT + LOCK / 2 + 4 };
    const lockEdge = { x: lock.x, y: lock.y + (higher ? LOCK / 2 : -LOCK / 2) };
    const paths = model.conditions.map((c) => {
      const u = at(c.from);
      const points =
        u.x + half + 4 < to.x
          ? [lockEdge, { x: to.x, y: u.y }, { x: u.x + half, y: u.y }]
          : [lockEdge, { x: u.x, y: u.y + (u.y > lockEdge.y ? -half : half) }];
      return { id: c.id, d: roundedPath(points, 9), drawD: roundedPath([...points].reverse(), 9) };
    });
    return { lock, paths };
  }
  const conditions = conditionGeometry();
  // (What was drawn, for the lines that go: they fade out where they were - see the effect above.)
  useLayoutEffect(() => {
    drawnConditionsRef.current = conditions;
  });

  function lockIcon(className: string, at: Point, style?: CSSProperties) {
    return (
      <g className={className} transform={`translate(${at.x} ${at.y})`}>
        <title>{tr("ui.condition_required_task")}</title>
        <g className="weft-eg-lock-inner" style={style}>
          <circle r={LOCK / 2} />
          <rect x={-3.6} y={-0.6} width={7.2} height={5.4} rx={1.1} />
          <path d="M -2.4 -0.8 V -2.6 A 2.4 2.4 0 0 1 2.4 -2.6 V -0.8" />
        </g>
      </g>
    );
  }

  function conditionLines() {
    if (!conditions && !fadingConditions) return null;
    const hot = model.conditions.some((c) => hotConditions.has(c.id));
    const dim = lit && !hot;
    return (
      <g className={"weft-eg-conditions" + (hot ? " is-hot" : dim ? " is-dim" : "")}>
        {fadingConditions?.paths.map((p) => <path key={`gone-${p.id}`} className="weft-eg-condition is-leaving" d={p.d} />)}
        {fadingConditions?.lock && !conditions && lockIcon("weft-eg-lock is-leaving", fadingConditions.lock)}
        {conditions?.paths.map((p, index) => {
          const drawing = freshConditions.ids.has(p.id);
          return (
            <g key={p.id}>
              {drawing && (
                <mask id={`weft-eg-cmask-${index}`} maskUnits="userSpaceOnUse" x={0} y={0} width={graphWidth} height={graphHeight}>
                  <path className="weft-eg-mask-path" d={p.drawD} pathLength={1} style={{ animationDuration: `${DRAW_MS}ms` }} />
                </mask>
              )}
              <path className="weft-eg-condition" d={p.d} mask={drawing ? `url(#weft-eg-cmask-${index})` : undefined}>
                <title>{tr("ui.condition_required_task")}</title>
              </path>
            </g>
          );
        })}
        {/* A new lock grows into view when its line has reached it. */}
        {conditions && lockIcon("weft-eg-lock" + (freshConditions.lock ? " is-new" : ""), conditions.lock, freshConditions.lock ? { animationDelay: `${DRAW_MS}ms` } : undefined)}
      </g>
    );
  }

  let detourIndex = 0;
  return (
    <div className="weft-timeline">
      <div className="weft-eg-frame" ref={frameRef}>
        <div className="weft-eg" style={{ width: graphWidth, height: graphHeight }} onMouseLeave={() => setHovered(null)}>
          <svg className="weft-eg-lines" width={graphWidth} height={graphHeight}>
            {[...frames.entries()].map(([blockId, frame]) => {
              if (frame.ids.length < 2) return null;
              const points = frame.ids.map(at);
              const left = Math.min(...points.map((p) => p.x)) - FRAME_PAD - ICON / 2;
              const right = Math.max(...points.map((p) => p.x)) + FRAME_PAD + ICON / 2;
              const top = Math.min(...points.map((p) => p.y)) - FRAME_TOP - ICON / 2;
              const bottom = Math.max(...points.map((p) => p.y)) + ICON / 2 + LABEL_HEIGHT;
              return <rect key={blockId} className="weft-eg-block" x={left} y={top} width={right - left} height={bottom - top} rx={12} />;
            })}
            {[...layout.edges].sort((a, b) => Number(b.route === "detour") - Number(a.route === "detour")).map((edge, edgeIndex) => {
              const info = model.edges.find((e) => e.id === edge.id)!;
              const u = at(edge.from);
              const v = at(edge.to);
              const detourY = rowsHeight - LABEL_HEIGHT + 10 + (edge.route === "detour" ? detourIndex++ * 8 : 0);
              const waits = info.kind !== "timed";
              const drawing = fresh.edges.has(edge.id);
              const className =
                "weft-eg-line" +
                (waits ? " is-waiting" : "") +
                (info.doubled ? " is-double" : "") +
                (edge.route === "detour" ? " is-detour" : "") +
                (hotEdges.has(edge.id) ? " is-hot" : lit ? " is-dim" : "");
              const d = edgePath(edge.route, u, v, columnWidth, detourY);
              // A double line is not labelled: it says that more happens than the line can tell.
              const showDelay = !waits && !info.doubled && info.delayMs > 0 && edge.route !== "detour";
              return (
                <g key={edge.id}>
                  {/* A new line is uncovered from its source to its target by a mask that is drawn - so it is painted as what it is
                      (dashed if it waits for the learner), not as a solid line that turns dashed afterwards. */}
                  {drawing && (
                    <mask id={`weft-eg-mask-${edgeIndex}`} maskUnits="userSpaceOnUse" x={0} y={0} width={graphWidth} height={graphHeight}>
                      <path
                        className="weft-eg-mask-path"
                        d={d}
                        pathLength={1}
                        style={{ animationDuration: `${DRAW_MS}ms`, animationDelay: `${fresh.edgeDelay.get(edge.id) ?? 0}ms` }}
                      />
                    </mask>
                  )}
                  <g mask={drawing ? `url(#weft-eg-mask-${edgeIndex})` : undefined}>
                    <path className={className} d={d}>
                      <title>
                        {info.doubled
                          ? tr("ui.two_triggers_the_events_are_shown")
                          : waits
                            ? tr("ui.waits_for_the_learner")
                            : info.delayMs > 0
                              ? tr("ui.after_s", { n0: info.delayMs / 1000 })
                              : tr("ui.happens_at_once")}
                      </title>
                    </path>
                    {/* A double line: the wide line with a narrow one in the colour of the ground over it. */}
                    {info.doubled && <path className={"weft-eg-line-gap" + (waits ? " is-waiting" : "")} d={d} />}
                  </g>
                  {showDelay && (
                    <text
                      className="weft-eg-delay"
                      x={edge.route === "straight" ? (u.x + v.x) / 2 : edge.route === "vertical" ? u.x + 8 : u.x + columnWidth / 2 + 4}
                      y={edge.route === "straight" ? u.y - 6 : edge.route === "vertical" ? (u.y + v.y) / 2 + ICON / 2 + LABEL_HEIGHT / 2 : v.y - 6}
                      textAnchor={edge.route === "vertical" ? "start" : "middle"}
                    >
                      {`${Math.round((info.delayMs / 1000) * 10) / 10} s`}
                    </text>
                  )}
                </g>
              );
            })}
            {conditionLines()}
          </svg>
          {[...frames.entries()].map(([blockId, frame]) => {
            if (frame.ids.length < 2) return null;
            const points = frame.ids.map(at);
            const left = Math.min(...points.map((p) => p.x)) - FRAME_PAD - ICON / 2;
            const top = Math.min(...points.map((p) => p.y)) - FRAME_TOP - ICON / 2;
            return (
              <span key={blockId} className="weft-eg-block-label" style={{ left: left + 10, top: top + 4 }}>
                {page.blocks[blockId]?.name?.trim() || (BLOCK_FRAME_LABELS[frame.kind] ?? "")}
              </span>
            );
          })}
          {model.nodes.map((n) => {
            const p = at(n.id);
            const color = colorOf(n);
            const selected =
              selection?.type === "event" &&
              selection.pageId === page.id &&
              (selection.nodeId === n.id || n.companions.some((c) => c.id === selection.nodeId));
            const dim = lit && !hotNodes.has(n.id);
            const detail = n.node.kind === "end" ? endTransitionLabel(page, n.id) : "";
            const dragged = drag?.nodeId === n.id;
            return (
              <div
                key={n.id}
                className={
                  "weft-eg-node" +
                  (dim ? " is-dim" : "") +
                  (fresh.nodes.has(n.id) ? " is-new" : "") +
                  (draggable.has(n.id) ? " is-draggable" : "") +
                  (dragged ? " is-dragged" : "")
                }
                style={{
                  left: p.x - 35,
                  top: p.y - ICON / 2,
                  ...(fresh.nodes.has(n.id) ? { animationDelay: `${fresh.nodeDelay.get(n.id) ?? 0}ms` } : {}),
                }}
                onMouseEnter={() => setHovered(n.id)}
                onPointerDown={draggable.has(n.id) ? (e) => startDrag(e, n.id) : undefined}
              >
                {/* A node that shows more than one event (see foldCompanions in eventGraph/model.ts) shows the icon of the first; the
                    title of the icon names them all. */}
                <TimelineNodeIcon
                  node={n.node}
                  color={color}
                  isSelected={selected}
                  isHot={hovered === n.id && !drag}
                  onSelect={() => {
                    if (suppressClickRef.current) return;
                    select({ type: "event", pageId: page.id, nodeId: n.id });
                  }}
                  unreachable={n.unreachable}
                  title={[n, ...n.companions].map((m) => eventTitle(page, m.node)).join(" · ")}
                />
                {/* The title selects the event like its icon does. */}
                <span
                  className="weft-timeline-node-label is-clickable"
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    select({ type: "event", pageId: page.id, nodeId: n.id });
                  }}
                >
                  {eventTitle(page, n.node)}
                  {detail && <span className="weft-timeline-label-detail"> ({detail})</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const BLOCK_FRAME_LABELS: Record<string, string> = { get quiz() { return tr("ui.quiz"); }, get cloze() { return tr("ui.gap_text"); }, get checker() { return tr("ui.checker"); }, get solution() { return tr("ui.solution"); }, get matching() { return tr("ui.matching"); }, get sort() { return tr("ui.sort"); }, get video() { return tr("ui.video"); }, get audio() { return tr("ui.audio"); } };

function TimelineNodeIcon({
  node,
  color,
  isSelected,
  isHot,
  unreachable,
  onSelect,
  title,
}: {
  node: TimelineNode;
  color: EventColor | "red";
  isSelected: boolean;
  isHot: boolean;
  unreachable: boolean;
  onSelect: () => void;
  title?: string;
}) {
  const icon =
    node.kind === "end"
      ? arrowRightIconSvg
      : node.eventType === "video-stop-point"
        ? stopPointIconSvg(node.stopsVideo !== false, node.shownKinds ?? [])
        : node.kind === "event" && node.eventType
          ? (EVENT_ICONS[node.eventType] ?? ICONS[eventLookOf(node.eventType)?.icon ?? "play"])
          : playIconSvg;
  const className = "weft-timeline-node-icon is-" + color + (isSelected ? " is-selected" : "") + (isHot ? " is-hot" : "");
  return (
    <button
      type="button"
      className={className}
      onClick={onSelect}
      title={unreachable ? tr("ui.nothing_triggers_this_event", { n0: title ?? nodeLabel(node) }) : (title ?? nodeLabel(node))}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}
