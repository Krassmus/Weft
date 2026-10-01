import { Fragment, useLayoutEffect, useRef, useState } from "react";
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
import type { Page, TimelineEventType, TimelineLane, TimelineNode, TransitionType } from "../../core/types";

const TRANSITION_LABELS: Record<TransitionType, string> = {
  none: "",
  fade: "Fade",
  move: "Move",
};

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

type TimelineGroup = { kind: "lane"; lane: TimelineLane } | { kind: "fork"; lanes: TimelineLane[] };

/**
 * Several lanes that all start at the very same node (e.g. a quiz's "Ausfüllen" - both its
 * "richtig" and "falsch" outcome lanes begin there, see buildQuizLane in document/pageTimeline.ts
 * - or two different blocks whose own Aufbau both happen to trigger off the very same event, see
 * buildBlockEffectLane) aren't actually independent paths - they're one shared start that then
 * forks. Grouping them here is what lets Timeline render that shared node exactly once with the
 * lanes visually splitting off it (see TimelineForkGroup), rather than repeating it once per lane
 * the way two truly unrelated lanes would. Not limited to lanes that happen to sit next to each
 * other in the array - a block's own Aufbau/Abbau lanes are always appended after every "intrinsic"
 * one (see syncPageTimelineEvents), so grouping has to find a match anywhere earlier in the list,
 * not just immediately before it. Only ever groups on a shared "event"-kind node (never "start") -
 * a shared "start" would have to use the bypass lane's own start->end edge as the fork's "trunk",
 * which reaches all the way to "end" and so isn't a sensible reference point for a short branch.
 */
function groupForkedLanes(lanes: TimelineLane[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  const forkIndexByFirstNodeId = new Map<string, number>();
  for (const lane of lanes) {
    const firstNode = lane.nodes[0];
    if (firstNode?.kind === "event") {
      const existingIndex = forkIndexByFirstNodeId.get(firstNode.id);
      if (existingIndex !== undefined) {
        const existing = groups[existingIndex];
        if (existing.kind === "lane") groups[existingIndex] = { kind: "fork", lanes: [existing.lane, lane] };
        else existing.lanes.push(lane);
        continue;
      }
      forkIndexByFirstNodeId.set(firstNode.id, groups.length);
    }
    groups.push({ kind: "lane", lane });
  }
  return groups;
}

/**
 * Renders a page's timeline (see mockups/timeline.png for where this is headed) from
 * page.timeline - a graph of lanes/nodes/edges (see PageTimeline in core/types.ts) that blocks
 * insert their own event/trigger nodes into (see syncPageTimelineEvents in
 * document/pageTimeline.ts), rather than this component scanning the page's blocks itself. Every
 * page always has the base lane createDefaultPageTimeline() creates - "start" straight to "end"
 * (the page's own transition, edited via TransitionPanel.tsx) - plus one extra lane per quiz
 * block's outcome that's actually wired to auto-advance, and one per video block. A lane doesn't
 * need to start at "start" or end at "end" - e.g. a quiz's own "Ausfüllen"/"Quiz abgeschickt"
 * events, or a non-autoplay video's "Start des Videos", aren't tied to the page's start, and
 * nothing about a video ever reaches "end" at all (only a quiz's outcome can trigger the next
 * slide) - see the "is-to-end"/"is-detached" line styling below, which only stretches a line to
 * fill the row (aligning every lane's "end" into one column) when it actually leads to "end". A
 * lane whose first node isn't itself "start" also gets a blank leading gap (see
 * .weft-timeline-lead-gap) so its icon never lines up under "Start der Folie" - that alignment
 * would read as "this begins exactly when the slide does", which is only true for an autoplay
 * video's own "Start des Videos" (see buildVideoLane), whose lane's first node genuinely is
 * "start" for exactly that reason. Lanes that share one starting node (a quiz's two outcomes) are
 * grouped and rendered as a visual fork instead - see groupForkedLanes/TimelineForkGroup. Every
 * node - "start", "end", or an "event" one - selects itself when clicked (see
 * TimelineLaneRow's own selectFor/isSelected), routing the Inspector to EventPanel.tsx; nothing
 * here ever selects the block behind an event or performs some other action directly.
 */
export function Timeline({ page }: { page: Page }) {
  const groups = groupForkedLanes(page.timeline.lanes);
  return (
    <div className="weft-timeline">
      {groups.map((group, i) =>
        group.kind === "fork" ? (
          <TimelineForkGroup key={i} lanes={group.lanes} page={page} />
        ) : (
          <div className="weft-timeline-lane" key={i}>
            <TimelineLaneRow lane={group.lane} page={page} />
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Renders `lanes` (all sharing one first node) stacked as their own block, flowchart-style: the
 * first lane keeps its real leading icon+label; every later one skips that same node entirely
 * (it's already shown once, above) and instead starts with a blank lead of exactly the width
 * needed to line its own line up under .weft-timeline-fork-spine below, rather than under where
 * its own (unrendered) copy of the shared node would otherwise have sat. The spine itself is a
 * single dashed line (styled like every other not-yet-scheduled edge) from midway between the
 * first lane's first two nodes (not through the shared node's own icon/label, which a dead-center
 * line would otherwise strike through) down to the last lane's own first *visible* node - both
 * measured via getBoundingClientRect rather than assumed from fixed row heights, since a label
 * can wrap to a different number of lines depending on its text and silently throw off any fixed
 * pixel math. Re-measures on resize (a sidebar drag can rewrap a label, changing row heights) via
 * ResizeObserver, the same pattern Canvas.tsx's own iframe scaling uses.
 */
function TimelineForkGroup({ lanes, page }: { lanes: TimelineLane[]; page: Page }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const topIconRef = useRef<HTMLElement | null>(null);
  const afterTopIconRef = useRef<HTMLElement | null>(null);
  const bottomIconRef = useRef<HTMLElement | null>(null);
  const [spine, setSpine] = useState<{ left: number; top: number; height: number; branchLineWidth: number } | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    function measure() {
      const top = topIconRef.current;
      const afterTop = afterTopIconRef.current;
      const bottom = bottomIconRef.current;
      if (!group || !top || !afterTop || !bottom) {
        setSpine(null);
        return;
      }
      const groupRect = group.getBoundingClientRect();
      const topRect = top.getBoundingClientRect();
      const afterTopRect = afterTop.getBoundingClientRect();
      const bottomRect = bottom.getBoundingClientRect();
      const topCenterX = topRect.left + topRect.width / 2;
      const afterTopCenterX = afterTopRect.left + afterTopRect.width / 2;
      const left = (topCenterX + afterTopCenterX) / 2 - groupRect.left;
      const topY = topRect.top + topRect.height / 2 - groupRect.top;
      const bottomY = bottomRect.top + bottomRect.height / 2 - groupRect.top;
      // Every branch's own second node (its first visible one) should land at the same X as the
      // top lane's own second node (afterTop) - not wherever a fixed-width line happens to end up
      // - so the "Quiz abgeschickt" icons stay in one column same as "Nächste Folie" already does.
      // The spine already lands at `left`; this is just how much further the branch's own line
      // has to stretch from there to close the rest of the way to that shared target.
      const afterTopLeft = afterTopRect.left - groupRect.left;
      const branchLineWidth = Math.max(0, afterTopLeft - left);
      setSpine({ left, top: topY, height: bottomY - topY, branchLineWidth });
    }
    measure();
    if (!group) return;
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [lanes]);

  return (
    <div className="weft-timeline-fork-group" ref={groupRef}>
      {spine && <div className="weft-timeline-fork-spine" style={{ left: spine.left, top: spine.top, height: spine.height }} />}
      {lanes.map((lane, i) => (
        <div className="weft-timeline-lane" key={i}>
          <TimelineLaneRow
            lane={lane}
            page={page}
            leadOverride={i > 0 ? { width: spine?.left, lineWidth: spine?.branchLineWidth } : undefined}
            iconRefs={(nodeIndex) => {
              if (i === 0 && nodeIndex === 0) return (el) => (topIconRef.current = el);
              if (i === 0 && nodeIndex === 1) return (el) => (afterTopIconRef.current = el);
              if (i === lanes.length - 1 && nodeIndex === (i > 0 ? 1 : 0)) return (el) => (bottomIconRef.current = el);
              return undefined;
            }}
          />
        </div>
      ))}
    </div>
  );
}

function TimelineLaneRow({
  lane,
  page,
  leadOverride,
  iconRefs,
}: {
  lane: TimelineLane;
  page: Page;
  /** Present (even with `width`/`lineWidth` still undefined, pre-measurement) when this lane is
   * a fork branch (see TimelineForkGroup): its first node is already shown once, in the lane
   * above, so it's skipped here entirely rather than repeated. In its place: a blank lead of
   * exactly `width` px, landing this lane's own line right under the fork's connecting spine
   * instead of whatever position its own (unrendered) copy of that node would have sat at, then
   * that line itself sized to exactly `lineWidth` px (not the usual fixed .is-detached width) so
   * its second node still lands at the same spot the lane above's own does, keeping every lane in
   * the fork lined up in one column from there on, same as their "Nächste Folie" already is. */
  leadOverride?: { width: number | undefined; lineWidth: number | undefined };
  /** Ref-callback for the icon at a given node index, if TimelineForkGroup needs to measure it
   * (to position .weft-timeline-fork-spine) - undefined for every index it doesn't care about. */
  iconRefs?: (nodeIndex: number) => ((el: HTMLElement | null) => void) | undefined;
}) {
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const transitionDetail = TRANSITION_LABELS[page.transition.type];

  // Every node - "start", "end", or a block-contributed "event" - selects the very same way now:
  // as itself, not as a shortcut for whatever block happens to be behind it (see EventPanel.tsx's
  // own doc comment for why clicking an event deliberately never opens that block's content/
  // position editor any more).
  function selectFor(node: TimelineNode): () => void {
    return () => select({ type: "event", pageId: page.id, nodeId: node.id });
  }

  function isSelected(node: TimelineNode): boolean {
    return selection?.type === "event" && selection.pageId === page.id && selection.nodeId === node.id;
  }

  // A lane anchored to neither "start" nor "end" reads as its own free-floating mini-timeline
  // (e.g. a video's own "Start/Ende des Videos") rather than a path to/from the page's start or
  // end - so instead of a compact cluster near the left (see .weft-timeline-lead-gap/is-detached),
  // its events space themselves evenly across the full row, as if an imaginary event stood at
  // each end (see .weft-timeline-track.is-distributed in App.css).
  const isIndependent = lane.nodes[0]?.kind !== "start" && lane.nodes[lane.nodes.length - 1]?.kind !== "end";
  // A fork branch skips its own first node entirely (see leadOverride's own doc comment above) -
  // still need the edge it would have carried, from that unrendered node to the next, so the line
  // right after the blank lead gets the right dashed/solid treatment.
  const startIndex = leadOverride ? 1 : 0;
  const leadEdge = leadOverride ? lane.edges.find((e) => e.from === lane.nodes[0]?.id && e.to === lane.nodes[1]?.id) : undefined;

  return (
    <div className={"weft-timeline-track" + (isIndependent ? " is-distributed" : "")}>
      {leadOverride ? (
        <>
          <div className="weft-timeline-fork-lead" style={{ flex: `0 0 ${leadOverride.width ?? 0}px` }} />
          {leadEdge && (
            <div
              className={"weft-timeline-line" + (leadEdge.kind === "timed" ? " is-timed" : "")}
              style={{ flex: `0 0 ${leadOverride.lineWidth ?? 48}px` }}
            />
          )}
        </>
      ) : isIndependent ? (
        <div className="weft-timeline-distribute-gap" />
      ) : (
        lane.nodes[0]?.kind !== "start" && <div className="weft-timeline-lead-gap" />
      )}
      {lane.nodes.slice(startIndex).map((node, idx) => {
        const i = startIndex + idx;
        const nextNode = lane.nodes[i + 1];
        const edge = nextNode ? lane.edges.find((e) => e.from === node.id && e.to === nextNode.id) : undefined;
        // A non-stopping stop point with exactly one child shows that child's own icon/label
        // instead of its own (see TimelineNode.inlineChild's own doc comment) - purely a display
        // swap: clicking still selects `node` itself (its real id - see selectFor/isSelected
        // below), so EventPanel.tsx sees the stop point and redirects to the same child from
        // there.
        const displayNode = node.inlineChild && node.children?.length === 1 ? node.children[0].node : node;
        return (
          <Fragment key={node.id}>
            <div className="weft-timeline-node">
              <TimelineNodeIcon
                node={displayNode}
                isSelected={isSelected(node)}
                isAnimated={isAnimatedNode(displayNode, page)}
                onSelect={selectFor(node)}
                iconRef={iconRefs?.(i)}
              />
              <span className="weft-timeline-node-label">
                {nodeLabel(displayNode)}
                {node.kind === "end" && transitionDetail && <span className="weft-timeline-label-detail"> ({transitionDetail})</span>}
              </span>
              {!node.inlineChild && node.children && node.children.length > 0 && (
                <div className="weft-timeline-node-children">
                  {node.children.map(({ node: child }) => (
                    <div className="weft-timeline-child" key={child.id}>
                      <div className="weft-timeline-child-connector" />
                      <TimelineNodeIcon
                        node={child}
                        isSelected={isSelected(child)}
                        isAnimated={isAnimatedNode(child, page)}
                        onSelect={selectFor(child)}
                      />
                      <span className="weft-timeline-node-label">{nodeLabel(child)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {edge && (
              <div
                className={
                  "weft-timeline-line" +
                  (edge.kind === "timed" ? " is-timed" : "") +
                  (isIndependent ? " is-distributed" : nextNode?.kind === "end" ? " is-to-end" : " is-detached")
                }
              />
            )}
          </Fragment>
        );
      })}
      {isIndependent && <div className="weft-timeline-distribute-gap" />}
    </div>
  );
}

/** Marks a node as its own kind of animation - Aufbau, Abbau (always, regardless of whether an
 * actual animation type is currently configured for it - the node's whole identity already is
 * "this block's own Aufbau/Abbau"), or "Nächste Folie" specifically when the page's own outgoing
 * Transition is actually animated (a plain cut isn't one) - see .weft-timeline-node-icon.
 * is-animated in App.css. Every other node (quiz/video's own intrinsic events, "start") is never
 * one - nothing about when they fire is itself an animation. */
function isAnimatedNode(node: TimelineNode, page: Page): boolean {
  if (node.kind === "end") return page.transition.type !== "none";
  return node.eventType === "block-entrance" || node.eventType === "block-exit";
}

function TimelineNodeIcon({
  node,
  isSelected,
  isAnimated,
  onSelect,
  iconRef,
}: {
  node: TimelineNode;
  isSelected: boolean;
  isAnimated: boolean;
  onSelect: () => void;
  iconRef?: (el: HTMLElement | null) => void;
}) {
  const icon = node.kind === "end" ? arrowRightIconSvg : node.kind === "event" && node.eventType ? EVENT_ICONS[node.eventType] : playIconSvg;
  const className = "weft-timeline-node-icon" + (isAnimated ? " is-animated" : "") + (isSelected ? " is-selected" : "");
  return (
    <button
      ref={iconRef}
      type="button"
      className={className}
      onClick={onSelect}
      title={nodeLabel(node)}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}
