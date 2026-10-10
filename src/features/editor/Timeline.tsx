import { useLayoutEffect, useMemo, useRef, useState } from "react";
import playIconSvg from "../../../mockups/icons/play.svg?raw";
import arrowRightIconSvg from "../../../mockups/icons/arr_1right.svg?raw";
import acceptIconSvg from "../../../mockups/icons/accept.svg?raw";
import declineIconSvg from "../../../mockups/icons/decline.svg?raw";
import hand2IconSvg from "../../../mockups/icons/hand2.svg?raw";
import video2IconSvg from "../../../mockups/icons/video2.svg?raw";
import stopIconSvg from "../../../mockups/icons/stop.svg?raw";
import pauseIconSvg from "../../../mockups/icons/pause.svg?raw";
import visibilityVisibleIconSvg from "../../../mockups/icons/visibility-visible.svg?raw";
import visibilityInvisibleIconSvg from "../../../mockups/icons/visibility-invisible.svg?raw";
import { isTriggerableNode, listAllNodes } from "../../core/document/pageTimeline";
import { useDocumentStore } from "../../core/document/store";
import { buildGraphModel } from "./eventGraph/model";
import type { EventColor, GraphNodeModel } from "./eventGraph/model";
import { layoutGraph } from "./eventGraph/layout";
import type { EdgeRoute } from "./eventGraph/layout";
import { TRANSITION_LABELS } from "../../core/document/transitions";
import type { Page, TimelineEventType, TimelineNode } from "../../core/types";


// No icon file for this in the set (see mockups/icons) - a plain "∞" glyph, drawn as an <svg
// text> so it slots into TimelineNodeIcon exactly like every other, file-based icon here (same
// dangerouslySetInnerHTML path, same currentColor fill via the CSS in App.css).
const INFINITY_ICON_SVG =
  '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="8" y="12" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#28497c">∞</text></svg>';

const EVENT_LABELS: Record<TimelineEventType, string> = {
  "quiz-fill-start": "Ausfüllen",
  "quiz-submit": "Quiz abgeschickt",
  "quiz-submit-correct": "Quiz abgeschickt",
  "quiz-submit-incorrect": "Quiz abgeschickt",
  "video-start-auto": "Start des Videos",
  "video-start-manual": "Start des Videos",
  "video-stop-point": "Stoppunkt",
  "video-end-loop": "Ende des Videos",
  "video-end-stop": "Ende des Videos",
  "block-entrance": "Erscheint",
  "block-exit": "Verschwindet",
};

// "richtig" keeps the checkmark; "falsch" gets its own (decline.svg) rather than sharing accept.svg
// - the two outcome lanes should read apart from each other at a glance, not just by their label.
const EVENT_ICONS: Record<TimelineEventType, string> = {
  "quiz-fill-start": hand2IconSvg,
  "quiz-submit": acceptIconSvg,
  "quiz-submit-correct": acceptIconSvg,
  "quiz-submit-incorrect": declineIconSvg,
  "video-start-auto": video2IconSvg,
  "video-start-manual": playIconSvg,
  // Same icon VideoStopPointDialog's own mini-timeline markers use (see panels/BlockPanel.tsx) -
  // so a stop point reads as the same thing whether you're looking at it there or here.
  "video-stop-point": pauseIconSvg,
  "video-end-loop": INFINITY_ICON_SVG,
  "video-end-stop": stopIconSvg,
  "block-entrance": visibilityVisibleIconSvg,
  "block-exit": visibilityInvisibleIconSvg,
};

/** Exported for BlockEffectEditor in panels/BlockPanel.tsx, which lists these same nodes (minus
 * "end" - see BlockEffect.triggerEventId in core/types.ts) as trigger options for a block's own
 * Aufbau/Abbau, and wants them to read exactly the same as they do here. */
export function nodeLabel(node: TimelineNode): string {
  if (node.label) return node.label;
  if (node.kind === "start") return "Start der Folie";
  if (node.kind === "end") return "Nächste Folie";
  if (node.kind === "event" && node.eventType) return EVENT_LABELS[node.eventType];
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
    .filter((node) => node.kind !== "end")
    .map((node) => ({ id: node.id, label: nodeLabel(node) }));
}

/** Every node that could be picked as a trigger TARGET (see TRIGGERABLE_EVENT_TYPES in
 * document/pageTimeline.ts) - the options EventPanel.tsx's own "Löst aus" offers when adding a
 * new outgoing trigger. */
export function listTriggerableNodes(page: Page): { id: string; label: string }[] {
  return listAllNodes(page)
    .filter(isTriggerableNode)
    .map((node) => ({ id: node.id, label: nodeLabel(node) }));
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
  if (route === "straight") return `M ${u.x + half} ${u.y} L ${v.x - half} ${v.y}`;
  if (route === "vertical") {
    // Under the icon and its label, straight down into the one below.
    return `M ${u.x} ${u.y + half + LABEL_HEIGHT} L ${v.x} ${v.y - half}`;
  }
  if (route === "down") {
    // Right, then down in the gap between the columns, then right again into the event from the left.
    const gap = u.x + Math.min(columnWidth / 2, half + 34);
    return roundedPath(
      [
        { x: u.x + half, y: u.y },
        { x: gap, y: u.y },
        { x: gap, y: v.y },
        { x: v.x - half, y: v.y },
      ],
      9,
    );
  }
  // A detour: leaves at 45° (down and right), runs along the bottom and comes back at 45° from below left.
  const drop = detourY - u.y;
  const rise = detourY - v.y;
  return roundedPath(
    [
      { x: u.x + half, y: u.y },
      { x: u.x + half + drop, y: detourY },
      { x: v.x - half - rise, y: detourY },
      { x: v.x - half, y: v.y },
    ],
    14,
  );
}

/**
 * Renders a page's event graph (see docs/event-graph.md): the events as round icons with their titles, the triggers as lines. What
 * the graph is made of comes from buildGraphModel (the events of the page's blocks, its triggers); where everything stands from
 * layoutGraph; this component turns that into pixels.
 *
 * - Colour says what kind of event it is: blue is the normal kind, yellow an animation (Aufbau, Abbau, a transition), violet
 *   something the learner does; red an event nothing can make happen.
 * - A line is dashed when it waits for the learner (Weiter), solid when it happens by itself - with its delay written on it.
 * - A line that can't run to the right or down (back in time, or in from below) is drawn faint, as a detour behind everything.
 * - A quiz and a video are event blocks: their events share a frame.
 * - Hovering an event lifts it and its lines and dims the rest.
 * Every event selects itself when clicked, routing the Inspector to EventPanel.tsx.
 */
export function Timeline({ page }: { page: Page }) {
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const [hovered, setHovered] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setAvailableWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  const graphHeight = rowsHeight + (detours.length > 0 ? 14 + detours.length * 8 : 0);

  const at = (id: string): Point => ({
    x: PAD_X + (layout.col.get(id) ?? 0) * columnWidth,
    y: PAD_TOP + ICON / 2 + (layout.row.get(id) ?? 0) * ROW_HEIGHT,
  });

  // Events and lines that stay lit while one is hovered: the event itself, its lines and the events at their other ends.
  const hotNodes = new Set<string>();
  const hotEdges = new Set<string>();
  if (hovered) {
    hotNodes.add(hovered);
    for (const edge of model.edges) {
      if (edge.from === hovered || edge.to === hovered) {
        hotEdges.add(edge.id);
        hotNodes.add(edge.from);
        hotNodes.add(edge.to);
      }
    }
  }

  // The frame of every event block: round its events, with the kind of block written on it.
  const frames = new Map<string, { kind: string; ids: string[] }>();
  for (const n of model.nodes) {
    if (!n.blockId || !n.blockKind) continue;
    const frame = frames.get(n.blockId) ?? { kind: n.blockKind, ids: [] };
    frame.ids.push(n.id);
    frames.set(n.blockId, frame);
  }

  function colorOf(n: GraphNodeModel): EventColor | "red" {
    if (n.unreachable) return "red";
    // A "Nächste Folie" that animates its transition is an animation.
    if (n.node.kind === "end" && (page.timeline.ends[n.id]?.transition.type ?? "none") !== "none") return "yellow";
    return n.color;
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
            {[...layout.edges].sort((a, b) => Number(b.route === "detour") - Number(a.route === "detour")).map((edge) => {
              const info = model.edges.find((e) => e.id === edge.id)!;
              const u = at(edge.from);
              const v = at(edge.to);
              const detourY = rowsHeight - LABEL_HEIGHT + 10 + (edge.route === "detour" ? detourIndex++ * 8 : 0);
              const waits = info.kind !== "timed";
              const className =
                "weft-eg-line" +
                (waits ? " is-waiting" : "") +
                (edge.route === "detour" ? " is-detour" : "") +
                (hotEdges.has(edge.id) ? " is-hot" : hovered ? " is-dim" : "");
              const d = edgePath(edge.route, u, v, columnWidth, detourY);
              const showDelay = !waits && info.delayMs > 0 && edge.route !== "detour";
              return (
                <g key={edge.id}>
                  <path className={className} d={d}>
                    <title>{waits ? "Wartet auf die Lernperson" : info.delayMs > 0 ? `Nach ${info.delayMs / 1000} s` : "Passiert sofort"}</title>
                  </path>
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
          </svg>
          {[...frames.entries()].map(([blockId, frame]) => {
            if (frame.ids.length < 2) return null;
            const points = frame.ids.map(at);
            const left = Math.min(...points.map((p) => p.x)) - FRAME_PAD - ICON / 2;
            const top = Math.min(...points.map((p) => p.y)) - FRAME_TOP - ICON / 2;
            return (
              <span key={blockId} className="weft-eg-block-label" style={{ left: left + 10, top: top + 3 }}>
                {BLOCK_FRAME_LABELS[frame.kind] ?? ""}
              </span>
            );
          })}
          {model.nodes.map((n) => {
            const p = at(n.id);
            const color = colorOf(n);
            const selected = selection?.type === "event" && selection.pageId === page.id && selection.nodeId === n.id;
            const dim = hovered !== null && !hotNodes.has(n.id);
            const detail = n.node.kind === "end" ? endTransitionLabel(page, n.id) : "";
            return (
              <div
                key={n.id}
                className={"weft-eg-node" + (dim ? " is-dim" : "")}
                style={{ left: p.x - 35, top: p.y - ICON / 2 }}
                onMouseEnter={() => setHovered(n.id)}
              >
                <TimelineNodeIcon
                  node={n.node}
                  color={color}
                  isSelected={selected}
                  isHot={hovered === n.id}
                  onSelect={() => select({ type: "event", pageId: page.id, nodeId: n.id })}
                  unreachable={n.unreachable}
                />
                <span className="weft-timeline-node-label">
                  {nodeLabel(n.node)}
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

const BLOCK_FRAME_LABELS: Record<string, string> = { quiz: "Quiz", video: "Video" };

function TimelineNodeIcon({
  node,
  color,
  isSelected,
  isHot,
  unreachable,
  onSelect,
}: {
  node: TimelineNode;
  color: EventColor | "red";
  isSelected: boolean;
  isHot: boolean;
  unreachable: boolean;
  onSelect: () => void;
}) {
  const icon = node.kind === "end" ? arrowRightIconSvg : node.kind === "event" && node.eventType ? EVENT_ICONS[node.eventType] : playIconSvg;
  const className = "weft-timeline-node-icon is-" + color + (isSelected ? " is-selected" : "") + (isHot ? " is-hot" : "");
  return (
    <button
      type="button"
      className={className}
      onClick={onSelect}
      title={unreachable ? `${nodeLabel(node)} – nichts löst dieses Ereignis aus` : nodeLabel(node)}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}
