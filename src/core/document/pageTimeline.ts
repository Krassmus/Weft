import { formatTimeMMSS } from "../formatTime";
import type { Block, Page, PageTimeline, QuizBlock, TimelineEdge, TimelineEdgeKind, TimelineEventType, TimelineLane, TimelineNode, VideoBlock } from "../types";

/**
 * What every page's timeline starts out as, and what older saves missing the field migrate to
 * (see unpack.ts): a single lane with just the "start" and "end" nodes, joined by a dashed
 * ("unknown"-timing) edge - causally after the start, but on no fixed schedule yet - and no
 * trigger edges at all.
 */
export function createDefaultPageTimeline(): PageTimeline {
  return {
    lanes: [
      {
        nodes: [
          { id: "start", kind: "start" },
          { id: "end", kind: "end" },
        ],
        edges: [{ from: "start", to: "end", kind: "unknown" }],
      },
    ],
    triggerEdges: [],
  };
}

function quizFillNodeId(quizBlockId: string): string {
  return `quiz-fill:${quizBlockId}`;
}

/** Distinct per outcome, exactly like quizEndNodeId - when a quiz's advanceOnCorrect AND
 * advanceOnIncorrect are both on, buildQuizLane builds two separate lanes, one per outcome, each
 * with its own submit node; without a distinct id per outcome those two nodes would collide (same
 * id, different eventType/label), which is exactly what made clicking either one in the graph
 * select both at once - see Timeline.tsx's own isSelected, which only ever compares by id. Kept
 * unsuffixed when `outcome` is omitted (the plain "Quiz abgeschickt" node built when neither flag
 * is on - see syncPageTimelineEvents), so that single, genuinely generic case doesn't churn ids
 * for no reason. Kept in sync by hand with player.runtime.js's own quizSubmitEventId. */
function quizSubmitNodeId(quizBlockId: string, outcome?: "richtig" | "falsch"): string {
  return outcome ? `quiz-submit:${quizBlockId}:${outcome}` : `quiz-submit:${quizBlockId}`;
}

const QUIZ_OUTCOME_EVENT_TYPES = { richtig: "quiz-submit-correct", falsch: "quiz-submit-incorrect" } as const;

/** A quiz outcome's own "Nächste Folie" - distinct per quiz *and* per outcome (see buildQuizLane's
 * own doc comment for why), even though every "end" node, this one included, still shows the same
 * generic "Nächste Folie" label/icon today (see nodeLabel/EVENT_ICONS in Timeline.tsx) - nothing
 * yet reads this id to show anything outcome-specific, but selecting one (see EventPanel.tsx) has
 * to land on *a* stable, distinct node, not the same one every other "end" would too. */
function quizEndNodeId(quizId: string, outcome: "richtig" | "falsch"): string {
  return `end:quiz:${quizId}:${outcome}`;
}

/**
 * Builds one quiz block's own lane: "Ausfüllen" (the learner picked a first option) leads to
 * "Quiz abgeschickt" (they submitted), both on no fixed schedule ("unknown"/dashed) since both
 * are up to the learner - neither is tied to "start", since filling out a quiz isn't the only
 * thing that can happen at the top of a page. Only when `finalEdge` is given does the lane reach
 * on to an "end" node at all - a quiz's outcome doesn't trigger the next slide unless the author
 * actually turned that on (see syncPageTimelineEvents), so an undefined outcome simply stops at
 * "submitted", rather than implying a connection to "end" that doesn't exist yet. `outcome`, when
 * given, also switches the submit node to its own outcome-specific TimelineEventType (so the
 * "richtig"/"falsch" lanes get visually distinct icons - see EVENT_ICONS in Timeline.tsx, not just
 * distinct labels) AND its own outcome-specific id (see quizSubmitNodeId - when both outcomes are
 * wired to their own lane, each needs a genuinely distinct node, not two different-looking nodes
 * that happen to share one id and so always select together), and gives its own "end" node its own
 * id too (see quizEndNodeId): a page can have several distinct "Nächste Folie"s (the plain bypass
 * one, and one per quiz outcome that reaches it), each of which might reasonably want its own
 * transition config some day, even though they all still share the one page-wide Page.transition
 * for now.
 */
function buildQuizLane(
  quiz: QuizBlock,
  finalEdge?: { kind: TimelineEdgeKind; delayMs?: number },
  outcome?: "richtig" | "falsch",
): TimelineLane {
  const fillId = quizFillNodeId(quiz.id);
  const submitId = quizSubmitNodeId(quiz.id, outcome);
  const nodes: TimelineNode[] = [
    { id: fillId, kind: "event", sourceBlockId: quiz.id, eventType: "quiz-fill-start" },
    {
      id: submitId,
      kind: "event",
      sourceBlockId: quiz.id,
      eventType: outcome ? QUIZ_OUTCOME_EVENT_TYPES[outcome] : "quiz-submit",
      ...(outcome ? { label: `Quiz abgeschickt (${outcome})` } : {}),
    },
  ];
  const edges: TimelineLane["edges"] = [{ from: fillId, to: submitId, kind: "unknown" }];
  if (finalEdge) {
    // outcome is always set here - finalEdge is only ever passed alongside it, see
    // syncPageTimelineEvents below.
    nodes.push({ id: outcome ? quizEndNodeId(quiz.id, outcome) : "end", kind: "end" });
    edges.push({ from: submitId, to: nodes[nodes.length - 1].id, ...finalEdge });
  }
  return { nodes, edges };
}

function videoStartNodeId(videoBlockId: string): string {
  return `video-start:${videoBlockId}`;
}

function videoEndNodeId(videoBlockId: string): string {
  return `video-end:${videoBlockId}`;
}

function videoStopNodeId(videoBlockId: string, stopPointId: string): string {
  return `video-stop:${videoBlockId}:${stopPointId}`;
}

/**
 * Builds one video block's own bare lane: "Start des Videos" leads through its stop points, in
 * playback order (VideoStopPoint.timeSeconds - see VideoStopPointDialog in panels/BlockPanel.tsx),
 * to "Ende des Videos". Unlike a quiz's timing, a video's own playback position *is* known once
 * it's started - so each edge up to the last stop point is "timed", with the exact delay between
 * the two points it connects; only the final stretch into "Ende des Videos" stays "unknown"/
 * dashed, since the video's total duration isn't recorded anywhere in the document for it to be
 * timed against. Which icon each end gets is exactly what VideoBlock.autoplay/loop already say
 * (see TimelineEventType in core/types.ts) - not a separate setting of its own. Bare, on purpose:
 * this lane never includes whatever leads INTO "Start des Videos" - see getVideoStartTrigger and
 * syncPageTimelineEvents, which prefix that on afterwards, once every node any trigger could name
 * already exists (a video's own start can now be triggered by anything, not just implied by
 * VideoBlock.autoplay tying it to "start" - see TRIGGERABLE_EVENT_TYPES).
 */
function buildVideoLane(video: VideoBlock): TimelineLane {
  const startId = videoStartNodeId(video.id);
  const endId = videoEndNodeId(video.id);

  const nodes: TimelineNode[] = [
    { id: startId, kind: "event", sourceBlockId: video.id, eventType: video.autoplay ? "video-start-auto" : "video-start-manual" },
  ];
  const edges: TimelineLane["edges"] = [];

  let previousId = startId;
  let previousTimeSeconds = 0;
  for (const stopPoint of video.stopPoints) {
    const stopId = videoStopNodeId(video.id, stopPoint.id);
    nodes.push({
      id: stopId,
      kind: "event",
      sourceBlockId: video.id,
      eventType: "video-stop-point",
      label: `Stoppunkt (${formatTimeMMSS(stopPoint.timeSeconds)})`,
    });
    edges.push({ from: previousId, to: stopId, kind: "timed", delayMs: Math.max(0, (stopPoint.timeSeconds - previousTimeSeconds) * 1000) });
    previousId = stopId;
    previousTimeSeconds = stopPoint.timeSeconds;
  }

  nodes.push({ id: endId, kind: "event", sourceBlockId: video.id, eventType: video.loop ? "video-end-loop" : "video-end-stop" });
  edges.push({ from: previousId, to: endId, kind: "unknown" });

  return { nodes, edges };
}

const BLOCK_KIND_LABELS: Record<Block["kind"], string> = {
  text: "Text",
  image: "Bild",
  video: "Video",
  iframe: "Iframe",
  button: "Button",
  quiz: "Quiz",
  shape: "Form",
};

/** Kept in sync by hand with player.runtime.js's own blockEffectEventId - see that file's header
 * for why it can't just import this. */
export function blockEffectNodeId(blockId: string, phase: "entrance" | "exit"): string {
  return `block-${phase}:${blockId}`;
}

function makeBlockEffectNode(block: Block, phase: "entrance" | "exit"): TimelineNode {
  return {
    id: blockEffectNodeId(block.id, phase),
    kind: "event",
    sourceBlockId: block.id,
    eventType: phase === "entrance" ? "block-entrance" : "block-exit",
    label: `${BLOCK_KIND_LABELS[block.kind]} ${phase === "entrance" ? "erscheint" : "verschwindet"}`,
  };
}

/**
 * Builds the short, detached lane a block's own Aufbau/Abbau shows up as (see makeBlockEffectNode)
 * - a copy of its resolved trigger's source node (not the original, so it renders exactly like it
 * does wherever else it already appears, and - when that source is itself a block-contributed
 * "event" node - groups/forks with whatever else shares it, the same way two quiz outcomes do, see
 * groupForkedLanes in Timeline.tsx) leading to the effect node itself. Always "timed": the delay
 * before the effect fires is something the author actually set (see getBlockEntranceTrigger/
 * getBlockExitTrigger), never "at some point, who knows" the way an untimed edge means elsewhere
 * in this file.
 */
function buildBlockEffectLane(targetNode: TimelineNode, sourceNode: TimelineNode, delayMs: number): TimelineLane {
  return {
    nodes: [{ ...sourceNode }, targetNode],
    edges: [{ from: sourceNode.id, to: targetNode.id, kind: "timed", delayMs }],
  };
}

/** The one place that decides whether a graph event can be the `to` of a PageTimeline.
 * triggerEdges entry - i.e. whether anything can be scripted to cause it. Every UI that needs
 * this decision (EventPanel.tsx's editable "Ausgelöst durch"/its "Löst aus" target picker,
 * BlockPanel.tsx's own Aufbau/Abbau trigger dropdowns) reads this one set rather than repeating
 * its own exceptions. "video-start-*": starting a video on command is a normal thing to script -
 * VideoBlock.autoplay is just this trigger's own implicit default, see getVideoStartTrigger.
 * "block-entrance"/"-exit": that's their entire purpose. Nothing else qualifies: a quiz being
 * filled out or submitted, or a video reaching a stop point or genuinely ending, only ever
 * happens because the learner did it or because real playback time passed - nothing may fake
 * that, however useful it might look in the abstract. Expect this set to grow as more block kinds
 * gain their own scriptable events - see the module doc comment on syncPageTimelineEvents below. */
export const TRIGGERABLE_EVENT_TYPES: ReadonlySet<TimelineEventType> = new Set<TimelineEventType>([
  "video-start-auto",
  "video-start-manual",
  "block-entrance",
  "block-exit",
]);

export function isTriggerableNode(node: TimelineNode): boolean {
  return node.kind === "event" && !!node.eventType && TRIGGERABLE_EVENT_TYPES.has(node.eventType);
}

/** Visits every node on the page exactly once, including any nested under a video stop point's
 * own `children` (see TimelineNode.children) - the one place that recursion happens, so every
 * other reader (findNode, listAllNodes below) can just call this instead of reimplementing the
 * walk themselves. */
function forEachNode(page: Page, visit: (node: TimelineNode) => void): void {
  for (const lane of page.timeline.lanes) {
    for (const node of lane.nodes) {
      visit(node);
      for (const child of node.children ?? []) visit(child.node);
    }
  }
}

/** Finds a node anywhere on the page by id, top-level or nested under a stop point (see
 * forEachNode) - used by EventPanel.tsx to resolve whatever node is currently selected or listed
 * as a trigger's `to`, regardless of how it ends up rendered. */
export function findNode(page: Page, nodeId: string): TimelineNode | undefined {
  let found: TimelineNode | undefined;
  forEachNode(page, (node) => {
    if (node.id === nodeId) found = node;
  });
  return found;
}

/** Every node on the page, deduplicated by id (the same node - e.g. "start", or a quiz's shared
 * submit event - can legitimately appear in more than one lane) - the shared basis for both
 * listPageTriggerEvents and listTriggerableNodes in Timeline.tsx, which layer this file's own
 * eventType classification (isTriggerableNode) with that file's own display labels (nodeLabel) -
 * something this file can't do itself without reaching into features/ for it. */
export function listAllNodes(page: Page): TimelineNode[] {
  const seen = new Map<string, TimelineNode>();
  forEachNode(page, (node) => {
    if (!seen.has(node.id)) seen.set(node.id, node);
  });
  return Array.from(seen.values());
}

function findTriggerEdge(timeline: PageTimeline, targetNodeId: string): TimelineEdge | undefined {
  return timeline.triggerEdges.find((e) => e.to === targetNodeId);
}

/** A block's own Aufbau always has SOME trigger - "no automatic Aufbau at all" isn't a real
 * option, a block has to appear somehow (see BlockEffect's own doc comment) - so with no explicit
 * override in page.timeline.triggerEdges, this resolves to the implicit default every block had
 * before entrance/exit effects existed at all: fires at "start" (Start der Folie), no delay (see
 * defaultEntranceEffect). Kept in sync by hand with player.runtime.js's own
 * resolveEntranceTrigger. */
export function getBlockEntranceTrigger(page: Page, block: Block): { from: string; delayMs: number } {
  const edge = findTriggerEdge(page.timeline, blockEffectNodeId(block.id, "entrance"));
  return edge ? { from: edge.from, delayMs: edge.delayMs ?? 0 } : { from: "start", delayMs: 0 };
}

/** Unlike entrance, "no automatic Abbau at all" - the block simply stays until the page itself
 * does - is a perfectly normal, in fact default, state: null with no explicit override, matching
 * defaultExitEffect. Kept in sync by hand with player.runtime.js's own resolveExitTrigger. */
export function getBlockExitTrigger(page: Page, block: Block): { from: string; delayMs: number } | null {
  const edge = findTriggerEdge(page.timeline, blockEffectNodeId(block.id, "exit"));
  return edge ? { from: edge.from, delayMs: edge.delayMs ?? 0 } : null;
}

/** A video's own "Start des Videos" trigger: an explicit override (see EventPanel.tsx) always
 * wins; with none, falls back to what VideoBlock.autoplay alone used to mean before this was
 * generalized - "start", no delay - or, off, no automatic trigger at all (the video only starts
 * on a learner's own click). Kept in sync by hand with player.runtime.js's own
 * resolveVideoStartTrigger. */
export function getVideoStartTrigger(page: Page, video: VideoBlock): { from: string; delayMs: number } | null {
  const edge = findTriggerEdge(page.timeline, videoStartNodeId(video.id));
  if (edge) return { from: edge.from, delayMs: edge.delayMs ?? 0 };
  return video.autoplay ? { from: "start", delayMs: 0 } : null;
}

/** Replaces whatever edge currently targets `to` (there's ever at most one, see PageTimeline.
 * triggerEdges' own doc comment) with a new one from `from` after `delayMs`, or removes it
 * entirely when `from` is null - the one place this bookkeeping happens, shared by every UI that
 * can create/edit/remove a trigger edge (see setEventTrigger in document/actions.ts, the only
 * caller). */
export function withTriggerEdge(edges: TimelineEdge[], to: string, from: string | null, delayMs: number): TimelineEdge[] {
  const rest = edges.filter((e) => e.to !== to);
  return from ? [...rest, { from, to, kind: "timed", delayMs }] : rest;
}

/**
 * Keeps a page's timeline in sync with its blocks - call this after any action that adds,
 * removes, or reconfigures a block, or after page.timeline.triggerEdges itself changes (see
 * actions.ts). The whole thing is recomputed from scratch each time rather than patched, so it
 * can never end up with a stale/orphaned node.
 *
 * `page.timeline.lanes` (the structural skeleton) is built in three passes, in this order, and
 * the order matters: (1) the page's own permanent start->end bypass lane - a quiz is never
 * mandatory, the learner can always move on regardless of it (see the keyboard-nav gate in
 * player.runtime.js) - plus one lane per quiz outcome that's actually wired to auto-advance
 * (QuizBlock.advanceOnCorrect/-Incorrect, see buildQuizLane) or, if neither is, one lane standing
 * in for "fills it out and submits, but nothing scheduled to happen next" (which, notably, never
 * reaches "end"), plus one bare lane per video block (see buildVideoLane - "Start des Videos" is
 * deliberately not yet linked to anything here). (2) every block's own Aufbau/Abbau marker node
 * (see makeBlockEffectNode) that should actually be visible - entrance when its effect.type isn't
 * "none" or its resolved trigger (see getBlockEntranceTrigger) isn't the implicit default, exit
 * whenever it has any resolved trigger at all (see getBlockExitTrigger) - registered into the
 * shared node lookup up front, before any of them get their own lane built, specifically so one
 * block's Aufbau can chain onto another block's Aufbau/Abbau (or a video's start) regardless of
 * which one happens to come first in page.blocks: existence here only ever depends on a block's
 * own config, never on whether whatever it's triggered BY happens to exist yet. (3) two things
 * that actually consume a resolved trigger, now that every node any of them could possibly name
 * is guaranteed to exist: each video's own start trigger (see getVideoStartTrigger) gets prefixed
 * onto the FRONT of that video's own lane from pass (1) - extending the same lane rather than
 * detaching it into its own - so a triggered (or still just autoplaying) video's chain still reads
 * as one continuous row; then each visible block-effect marker from pass (2) gets its own short
 * detached lane (see buildBlockEffectLane), chained onto whatever node its own resolved trigger
 * names - which, thanks to pass (2) running first, may itself be another block's own Aufbau/Abbau
 * marker, not just an "intrinsic" event, unlike before this was generalized.
 *
 * Finally, page.timeline.triggerEdges itself - the author-facing single source of truth for every
 * one of these triggers (see PageTimeline's own doc comment) - is pruned: any edge whose `to` no
 * longer names a block/video still on this page, or whose `from` no longer names any node that
 * still exists, is dropped (e.g. the block or video either end of it used to point at was
 * deleted).
 */
export function syncPageTimelineEvents(page: Page): void {
  const quizzes = page.blocks.filter((b): b is QuizBlock => b.kind === "quiz");
  const videos = page.blocks.filter((b): b is VideoBlock => b.kind === "video");

  const bypassLane: TimelineLane = {
    nodes: [
      { id: "start", kind: "start" },
      { id: "end", kind: "end" },
    ],
    edges: [{ from: "start", to: "end", kind: "unknown" }],
  };

  const lanes: TimelineLane[] = [bypassLane];
  for (const quiz of quizzes) {
    if (quiz.advanceOnCorrect) lanes.push(buildQuizLane(quiz, { kind: "timed", delayMs: 1500 }, "richtig"));
    if (quiz.advanceOnIncorrect) lanes.push(buildQuizLane(quiz, { kind: "timed", delayMs: 1500 }, "falsch"));
    if (!quiz.advanceOnCorrect && !quiz.advanceOnIncorrect) lanes.push(buildQuizLane(quiz));
  }
  const videoLanes = videos.map((video) => ({ video, lane: buildVideoLane(video) }));
  for (const { lane } of videoLanes) lanes.push(lane);

  const nodesById = new Map<string, TimelineNode>();
  for (const lane of lanes) for (const node of lane.nodes) nodesById.set(node.id, node);

  const entranceTargets = page.blocks
    .map((block) => ({ block, trigger: getBlockEntranceTrigger(page, block) }))
    .filter(({ block, trigger }) => block.entranceEffect.type !== "none" || trigger.from !== "start" || trigger.delayMs !== 0);
  const exitTargets: { block: Block; trigger: { from: string; delayMs: number } }[] = [];
  for (const block of page.blocks) {
    const trigger = getBlockExitTrigger(page, block);
    if (trigger) exitTargets.push({ block, trigger });
  }
  for (const { block } of entranceTargets) nodesById.set(blockEffectNodeId(block.id, "entrance"), makeBlockEffectNode(block, "entrance"));
  for (const { block } of exitTargets) nodesById.set(blockEffectNodeId(block.id, "exit"), makeBlockEffectNode(block, "exit"));

  for (const { video, lane } of videoLanes) {
    const trigger = getVideoStartTrigger(page, video);
    if (!trigger) continue;
    const sourceNode = nodesById.get(trigger.from);
    if (!sourceNode) continue;
    lane.nodes.unshift({ ...sourceNode });
    lane.edges.unshift({ from: sourceNode.id, to: videoStartNodeId(video.id), kind: "timed", delayMs: trigger.delayMs });
  }

  // A block-effect whose resolved trigger source is a video's own stop point renders as a small
  // vertical stack right under that stop point (TimelineNode.children) instead of as its own
  // detached horizontal lane - a stop point sits in the *middle* of its video's own lane, so a
  // lane starting from a copy of it would make the video's own timeline look like it has two of
  // the same stop point on two different rows (see this function's own module doc comment).
  // Anything else - "start", a quiz's own events, another block's own Aufbau/Abbau, a video's own
  // start - keeps using the lane-based rendering exactly as before.
  function attach(targetNode: TimelineNode, sourceNode: TimelineNode, delayMs: number) {
    if (sourceNode.kind === "event" && sourceNode.eventType === "video-stop-point") {
      (sourceNode.children ??= []).push({ node: targetNode, delayMs });
    } else {
      lanes.push(buildBlockEffectLane(targetNode, sourceNode, delayMs));
    }
  }
  for (const { block, trigger } of entranceTargets) {
    const sourceNode = nodesById.get(trigger.from);
    if (sourceNode) attach(makeBlockEffectNode(block, "entrance"), sourceNode, trigger.delayMs);
  }
  for (const { block, trigger } of exitTargets) {
    const sourceNode = nodesById.get(trigger.from);
    if (sourceNode) attach(makeBlockEffectNode(block, "exit"), sourceNode, trigger.delayMs);
  }

  // A stop point that doesn't actually pause the video (VideoStopPoint.stopsVideo false) has no
  // meaning of its own beyond marking a moment in time - if it ends up triggering exactly one
  // thing, showing both its own "Stoppunkt" marker AND that one child stacked underneath is pure
  // clutter. Flagging it `inlineChild` (rather than actually replacing/removing the node - see
  // TimelineNode.children's own doc comment on why identity is never touched here) lets
  // Timeline.tsx show that one child's own icon/label in its place instead - and EventPanel.tsx
  // redirect to editing that child directly - while the stop point's own id/label/eventType, and
  // its place in `lanes`, stay completely real: still findable, still listable as a trigger
  // *source* elsewhere (nothing about being flagged this way changes what actually fires it or
  // what it can still cause). A stop point that DOES pause the video keeps showing itself no
  // matter what, and one with more than one child does too, since there's no single child left to
  // stand in for it.
  for (const { video } of videoLanes) {
    for (const stopPoint of video.stopPoints) {
      if (stopPoint.stopsVideo) continue;
      const stopNode = nodesById.get(videoStopNodeId(video.id, stopPoint.id));
      if (stopNode?.children?.length === 1) stopNode.inlineChild = true;
    }
  }

  page.timeline.lanes = lanes;

  const validTargets = new Set<string>();
  for (const block of page.blocks) {
    validTargets.add(blockEffectNodeId(block.id, "entrance"));
    validTargets.add(blockEffectNodeId(block.id, "exit"));
  }
  for (const video of videos) validTargets.add(videoStartNodeId(video.id));
  page.timeline.triggerEdges = page.timeline.triggerEdges.filter((e) => validTargets.has(e.to) && nodesById.has(e.from));
}
