import { isSnapshot } from "../collab/mutationScope";
import { formatTimeMMSS } from "../formatTime";
import { orderedValues } from "./ordering";
import type { Block, Page, PageTimeline, QuizBlock, TimelineEdge, TimelineEdgeKind, TimelineEventType, TimelineLane, TimelineNode, UUID, VideoBlock } from "../types";

/**
 * What every page's timeline starts out as, and what older saves missing the field migrate to
 * (see unpack.ts): a single lane with just the "start" and "end" nodes, joined by a dashed
 * ("unknown"-timing) edge - causally after the start, but on no fixed schedule yet - and no
 * trigger edges at all.
 */
export function createDefaultPageTimeline(): PageTimeline {
  // No lanes: the graph's rows are computed from the page's blocks and trigger edges whenever
  // they're needed (see getPageLanes), never stored.
  return {
    // No explicit "Nächste Folie" edge needed - getEndTrigger's own fallback (no edge at all)
    // already dynamically computes "Weiter, appended after everything else on the page", exactly
    // the same way an unconfigured block's own Aufbau does (see computeAdvanceChainTail) - a
    // brand-new, empty page already behaves exactly like today (one Space/→ press leaves it)
    // without needing anything stored up front. migrateMissingAdvanceTriggers in io/unpack.ts
    // backs an EXPLICIT edge onto every *older* page instead, since those have to keep behaving
    // exactly as they already did regardless of what gets added to them later - see that
    // function's own doc comment for why a dynamic default would be wrong there.
    triggerEdges: {},
  };
}

export function quizFillNodeId(quizBlockId: string): string {
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
export function quizSubmitNodeId(quizBlockId: string, outcome?: "richtig" | "falsch"): string {
  return outcome ? `quiz-submit:${quizBlockId}:${outcome}` : `quiz-submit:${quizBlockId}`;
}

const QUIZ_OUTCOME_EVENT_TYPES = { richtig: "quiz-submit-correct", falsch: "quiz-submit-incorrect" } as const;

/** A quiz outcome's own "Nächste Folie" - distinct per quiz *and* per outcome (see buildQuizLane's
 * own doc comment for why), even though every "end" node, this one included, still shows the same
 * generic "Nächste Folie" label/icon today (see nodeLabel/EVENT_ICONS in Timeline.tsx) - nothing
 * yet reads this id to show anything outcome-specific, but selecting one (see EventPanel.tsx) has
 * to land on *a* stable, distinct node, not the same one every other "end" would too. */
export function quizEndNodeId(quizId: string, outcome: "richtig" | "falsch"): string {
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

export function videoStartNodeId(videoBlockId: string): string {
  return `video-start:${videoBlockId}`;
}

export function videoEndNodeId(videoBlockId: string): string {
  return `video-end:${videoBlockId}`;
}

export function videoStopNodeId(videoBlockId: string, stopPointId: string): string {
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
  language: "Sprachschalter",
  code: "Code",
  tex: "Formel",
  image: "Bild",
  video: "Video",
  iframe: "Iframe",
  button: "Button",
  quiz: "Quiz",
  shape: "Form",
  arrow: "Pfeil",
  files: "Dateien",
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
  for (const lane of getPageLanes(page)) {
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

/** The trigger edges as a list (each with its `to`), ordered by `to` so that every reader - the
 * editor and, via toRuntimeModule, the exported player - walks them in the same order wherever the
 * stored map happens to enumerate them. */
export function triggerEdgeList(timeline: PageTimeline): TimelineEdge[] {
  return Object.keys(timeline.triggerEdges)
    .sort()
    .map((to) => ({ ...timeline.triggerEdges[to], to }));
}

function findTriggerEdge(timeline: PageTimeline, targetNodeId: string): TimelineEdge | undefined {
  const edge = timeline.triggerEdges[targetNodeId];
  return edge ? { ...edge, to: targetNodeId } : undefined;
}

/** What actually causes a trigger to fire, as read back from one `TimelineEdge` - either a fixed
 * delay after `from` ("timed"), or "whenever the learner next presses Weiter after `from` has
 * already fired" ("advance", see TimelineEdgeKind's own doc comment in core/types.ts). Every
 * getBlockEntranceTrigger/getBlockExitTrigger/getVideoStartTrigger/getEndTrigger function below
 * returns this same shape (or null, where "no automatic trigger at all" is itself a real,
 * meaningful state) so the editor UI (TriggerPicker.tsx) and the player (player.runtime.js's own
 * hand-mirrored copy of this type) only ever have ONE shape to branch on. */
export type ResolvedTrigger = { kind: "timed"; from: string; delayMs: number } | { kind: "advance"; from: string };

function resolvedTriggerFromEdge(edge: TimelineEdge): ResolvedTrigger {
  return edge.kind === "advance" ? { kind: "advance", from: edge.from } : { kind: "timed", from: edge.from, delayMs: edge.delayMs ?? 0 };
}

/** The end of whatever's EXPLICITLY chained onto "Weiter" via a real, stored triggerEdges entry
 * (every "advance"-kind edge, found by following which `to` is never itself used as another such
 * edge's `from` yet) - "start" if nothing's explicitly chained. Doesn't know about any block still
 * sitting at its own implicit default (see computeImplicitEntranceChain) - only
 * computeAdvanceChainTail (below), which layers that on top, is safe to use as "the" current tail;
 * this half only exists because computeImplicitEntranceChain itself needs this same explicit-only
 * answer as ITS OWN starting point, without recursing into itself. */
function computeExplicitAdvanceChainTail(page: Page, excludeNodeId: string | null): string {
  const advanceEdges = triggerEdgeList(page.timeline).filter((e) => e.kind === "advance" && e.to !== excludeNodeId);
  const froms = new Set(advanceEdges.map((e) => e.from));
  for (const edge of advanceEdges) {
    if (!froms.has(edge.to)) return edge.to;
  }
  return "start";
}

/** Whether event `startId` can only happen after event `targetId` has - following what causes what:
 * the stored trigger edge of a node, or else the (not yet stored) default `implicitFrom` already
 * hands it. A node with neither is a root (an event nothing on the page waits for). Chaining
 * `targetId` after something for which this is true would close a loop - a set of events each
 * waiting for the next, none of which could ever fire. */
function waitsOn(page: Page, startId: string, targetId: string, implicitFrom: Map<string, string>): boolean {
  const seen = new Set<string>();
  let id: string | undefined = startId;
  while (id !== undefined && !seen.has(id)) {
    if (id === targetId) return true;
    seen.add(id);
    id = page.timeline.triggerEdges[id]?.from ?? implicitFrom.get(id);
  }
  return false;
}

/** Whether `candidateId` may be offered as the source of `targetId`'s trigger: not itself, and not
 * anything that already waits on it (see waitsOn) - either would be a loop. The defaults of events
 * with no stored trigger of their own aren't known here and can't matter: such a default is itself
 * chosen so as never to wait on what waits on it (see walkAdvanceQueue). */
export function canTriggerFrom(page: Page, candidateId: string, targetId: string): boolean {
  return !waitsOn(page, candidateId, targetId, new Map());
}

/** The Weiter queue as it stands: where every block that is still at its default Aufbau trigger
 * sits in it (`entranceFrom`, by block id), and the queue's end (`tail`). Walks every PAGE block
 * with no EXPLICIT entrance edge of its own, in the page's block order, appending each one after
 * the previous - rather than one at a time in isolation: two freshly added images, both still at
 * their own untouched default, have to end up queued one after another (the second right after the
 * first), not both racing to be "right after Start der Folie" independently. Starts from
 * computeExplicitAdvanceChainTail's answer - anything the author already explicitly arranged comes
 * first, regardless of where in the page's blocks it happens to sit.
 *
 * Appending a block after the end of the queue is only possible if that end doesn't (somewhere up
 * its own chain, through any kind of explicit edge) wait for the block itself - otherwise it would
 * wait for something that waits for it, and neither would ever happen. That's the case when the
 * author has chained other events onto this block's Aufbau by hand (say "B appears 1s after A, C
 * appears on Weiter after B", with A left at its default): the explicit chain's end is C, which
 * depends on A. Such a block is queued right after "start" instead - it is upstream of the explicit
 * chain, so it belongs in front of it - and the end of the queue stays where it was.
 * `excludeNodeId` leaves one node out entirely (the node currently being (re)configured). */
function walkAdvanceQueue(page: Page, excludeNodeId: string | null): { entranceFrom: Map<UUID, string>; tail: string } {
  let tail = computeExplicitAdvanceChainTail(page, excludeNodeId);
  const entranceFrom = new Map<UUID, string>();
  const implicitFrom = new Map<string, string>(); // by node id, for waitsOn
  for (const block of orderedValues(page.blocks)) {
    if (block.entranceEffect.type === "off") continue; // no Aufbau at all - never part of the queue
    const nodeId = blockEffectNodeId(block.id, "entrance");
    if (nodeId === excludeNodeId || findTriggerEdge(page.timeline, nodeId)) continue; // explicit - not part of this walk
    if (waitsOn(page, tail, nodeId, implicitFrom)) {
      entranceFrom.set(block.id, "start");
      implicitFrom.set(nodeId, "start");
    } else {
      entranceFrom.set(block.id, tail);
      implicitFrom.set(nodeId, tail);
      tail = nodeId;
    }
  }
  return { entranceFrom, tail };
}

/** Where every PAGE block with no EXPLICIT entrance edge of its own currently sits in the Weiter
 * queue, keyed by block id - the dynamic default getBlockEntranceTrigger falls back to (see
 * walkAdvanceQueue). */
function computeImplicitEntranceChain(page: Page): Map<UUID, string> {
  return walkAdvanceQueue(page, null).entranceFrom;
}

/** The current true end of this page's whole Weiter queue, EXPLICIT edges and every
 * still-at-its-own-implicit-default block both accounted for (see walkAdvanceQueue) - "start" if
 * the queue is entirely empty. Used as the smart default `from` the instant a TriggerPicker
 * switches a trigger to "Weiter" (or whenever getEndTrigger/getBlockExitTrigger themselves need
 * it): the new one slots in after EVERYTHING already queued, explicit or not, rather than racing
 * whatever's already first in line - unless that end already waits for the node itself (see
 * waitsOn), in which case it can't go there and goes right after "start". `excludeNodeId` leaves
 * one node out of consideration entirely (the node currently being (re)configured, so re-picking
 * "Weiter" for something already chained doesn't try to chain it onto itself) - pass null to not
 * exclude anything. */
export function computeAdvanceChainTail(page: Page, excludeNodeId: string | null): string {
  const { entranceFrom, tail } = walkAdvanceQueue(page, excludeNodeId);
  if (excludeNodeId === null) return tail;
  const implicitFrom = new Map<string, string>();
  for (const [blockId, from] of entranceFrom) implicitFrom.set(blockEffectNodeId(blockId, "entrance"), from);
  return waitsOn(page, tail, excludeNodeId, implicitFrom) ? "start" : tail;
}

/** A block's own Aufbau trigger - null when there's no Aufbau at all (`entranceEffect.type ===
 * "off"`, see BlockEffectType's own doc comment in core/types.ts): short-circuits here regardless
 * of whatever trigger edge might still be stored, so toggling back to "none"/"fade"/"move" later
 * picks up exactly where it left off. Otherwise resolves from page.timeline.triggerEdges as usual,
 * and with no explicit override there either, defaults to "Weiter", appended after whatever's
 * already queued (see computeImplicitEntranceChain) - matches how a freshly configured Aufbau
 * should behave (wait for the learner to reveal it) - for a block that's actually one of THIS
 * page's own `page.blocks`. A block merged in from the page's own LAYOUT instead keeps the old
 * unconditional default (fires at "start", no delay) regardless - syncPageTimelineEvents's own
 * `validTargets` only ever covers `page.blocks`, so a layout block's own trigger edge can never
 * durably persist per-page anyway; changing its default would only be a silent, un-fixable-via-UI
 * regression for shared layout content, not a real new capability. Kept in sync by hand with
 * player.runtime.js's own resolveEntranceTrigger. */
export function getBlockEntranceTrigger(page: Page, block: Block): ResolvedTrigger | null {
  if (block.entranceEffect.type === "off") return null;
  const edge = findTriggerEdge(page.timeline, blockEffectNodeId(block.id, "entrance"));
  if (edge) return resolvedTriggerFromEdge(edge);
  if (!(block.id in page.blocks)) return { kind: "timed", from: "start", delayMs: 0 };
  return { kind: "advance", from: computeImplicitEntranceChain(page).get(block.id) ?? "start" };
}

/** A block's own Abbau trigger - null both for "no Abbau at all" (`exitEffect.type === "off"`,
 * the default - see BlockEffectType's own doc comment in core/types.ts, same short-circuit
 * getBlockEntranceTrigger uses) AND, unlike entrance, also whenever a LAYOUT block's own Abbau
 * somehow resolves here (same "can never durably persist per-page" reasoning as entrance). With
 * an actual Abbau configured (type "none"/"fade"/"move") and no explicit trigger edge yet,
 * defaults to "Weiter" too, same as entrance - a freshly chosen "Fade" Abbau needs an actual
 * trigger to mean anything, and "Weiter" is the sensible one to assume until the author says
 * otherwise. Kept in sync by hand with player.runtime.js's own resolveExitTrigger. */
export function getBlockExitTrigger(page: Page, block: Block): ResolvedTrigger | null {
  if (block.exitEffect.type === "off") return null;
  const edge = findTriggerEdge(page.timeline, blockEffectNodeId(block.id, "exit"));
  if (edge) return resolvedTriggerFromEdge(edge);
  if (!(block.id in page.blocks)) return null;
  const nodeId = blockEffectNodeId(block.id, "exit");
  return { kind: "advance", from: computeAdvanceChainTail(page, nodeId) };
}

/** A video's own "Start des Videos" trigger: an explicit override (see EventPanel.tsx) always
 * wins - "Weiter" is one of the choices there too now, just never the default - with none, falls
 * back to what VideoBlock.autoplay alone used to mean before this was generalized - "start", no
 * delay - or, off, no automatic trigger at all (the video only starts on a learner's own click).
 * Kept in sync by hand with player.runtime.js's own resolveVideoStartTrigger. */
export function getVideoStartTrigger(page: Page, video: VideoBlock): ResolvedTrigger | null {
  const edge = findTriggerEdge(page.timeline, videoStartNodeId(video.id));
  if (edge) return resolvedTriggerFromEdge(edge);
  return video.autoplay ? { kind: "timed", from: "start", delayMs: 0 } : null;
}

/** "Nächste Folie"'s own trigger - unlike every other triggerable node, this only ever offers
 * "Weiter" (kind "advance") or "Gar nicht" (null - the page can then only be left some other way:
 * a button block, a quiz's own auto-advance). Reads the edge targeting the literal "end" id - a
 * quiz outcome's own `end:quiz:...` node is a completely separate, unrelated mechanism (see
 * buildQuizLane's own `finalEdge`, built straight from QuizBlock.advanceOnCorrect/-Incorrect every
 * sync, never stored in triggerEdges at all) and never touches this function.
 *
 * With no explicit edge, this dynamically defaults to "Weiter, appended after everything else
 * already queued" (see computeAdvanceChainTail) - the SAME dynamic default a block's own
 * unconfigured Aufbau gets, and for the same reason: "end" has to keep sliding to the back of the
 * queue as blocks are added, not stay wherever it was first put, or it would fire too early the
 * moment anything else is also Weiter-triggered (the "end" page in the module ends way too soon"
 * bug this replaced). Querying this is therefore NOT free of page.blocks - unlike almost every
 * other getter here, it has to re-walk the whole page each call.
 *
 * "Gar nicht" has to be an EXPLICIT edge (any kind other than "advance" - EventPanel.tsx's own
 * EndTriggerSection writes "unknown"), never representable as "no edge at all" - that's exactly
 * what "never configured" also looks like, which has to mean the dynamic default above. For an
 * *existing* document, migrateMissingAdvanceTriggers in io/unpack.ts backs an EXPLICIT
 * {from:"start",kind:"advance"} edge onto every page once, on load, BEFORE this default's meaning
 * had a chance to change for it - that one page's "end" then behaves exactly as it always did
 * (reachable in one press, full stop), never sliding to accommodate new Weiter-triggered blocks
 * added after the fact, which is correct: an old save's own existing blocks were never going to
 * become Weiter-triggered out from under it either (see getBlockEntranceTrigger's own migration-
 * reliant guarantee). A brand-new page has no such edge and simply uses the dynamic default from
 * the start. Kept in sync by hand with player.runtime.js's own resolveEndTrigger. */
export function getEndTrigger(page: Page): ResolvedTrigger | null {
  const edge = findTriggerEdge(page.timeline, "end");
  if (!edge) return { kind: "advance", from: computeAdvanceChainTail(page, "end") };
  return edge.kind === "advance" ? { kind: "advance", from: edge.from } : null;
}

/** Sets the edge that causes `to` (there's ever at most one, see PageTimeline.triggerEdges) to one
 * from `from` (`kind` "timed" by default, matching every existing call site; pass "advance"
 * explicitly for a Weiter-triggered one - `delayMs` is simply ignored for that kind), or removes it
 * entirely when `from` is null - the one place this bookkeeping happens, shared by every UI that can
 * create/edit/remove a trigger edge (see setEventTrigger in document/actions.ts, the only caller).
 * Writes only that one entry. */
export function setTriggerEdge(
  timeline: PageTimeline,
  to: string,
  from: string | null,
  delayMs: number,
  kind: TimelineEdgeKind = "timed",
): void {
  if (from) timeline.triggerEdges[to] = { from, kind, delayMs };
  else delete timeline.triggerEdges[to];
}

/**
 * Builds a page's event graph from scratch out of its blocks and trigger edges (see getPageLanes,
 * which is what everything else calls) - recomputed rather than patched, so it can never end up
 * with a stale/orphaned node.
 *
 * The lanes (the structural skeleton) are built in three passes, in this order, and
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
 * as one continuous row; then every block-effect marker from pass (2) (plus "end" itself, see
 * getEndTrigger) that's triggered by something is walked into place by extendChain, which keeps
 * extending the SAME lane through a whole straight run of them - a page where several blocks are
 * all queued on "Weiter" one after another, including the page's own bypass lane for the common
 * case of still ending at "start"/"end", reads as ONE continuous row instead of a separate
 * detached one per link - only actually branching into separate rows where the data itself forks
 * (two different things both triggered by the very same event), rendered via the exact same
 * groupForkedLanes fork-handling Timeline.tsx already uses for two quiz outcomes.
 */
function buildPageLanes(page: Page): { lanes: TimelineLane[]; nodesById: Map<string, TimelineNode> } {
  const blocks = orderedValues(page.blocks);
  const quizzes = blocks.filter((b): b is QuizBlock => b.kind === "quiz");
  const videos = blocks.filter((b): b is VideoBlock => b.kind === "video");

  const startNode: TimelineNode = { id: "start", kind: "start" };
  const endNode: TimelineNode = { id: "end", kind: "end" };
  // "end" is deliberately NOT in here yet (unlike before) - it's attached into place below,
  // exactly like a block's own Aufbau/Abbau, so it lands whichever its own resolved trigger
  // actually says, including - the common case - right after "start" when nothing else is queued.
  const bypassLane: TimelineLane = { nodes: [startNode], edges: [] };

  const lanes: TimelineLane[] = [bypassLane];
  for (const quiz of quizzes) {
    // An open question has no wrong answer: whatever is submitted counts as "richtig" (see QuizBlock.open).
    const advanceOnIncorrect = quiz.advanceOnIncorrect && !quiz.open;
    if (quiz.advanceOnCorrect) lanes.push(buildQuizLane(quiz, { kind: "timed", delayMs: 1500 }, "richtig"));
    if (advanceOnIncorrect) lanes.push(buildQuizLane(quiz, { kind: "timed", delayMs: 1500 }, "falsch"));
    if (!quiz.advanceOnCorrect && !advanceOnIncorrect) lanes.push(buildQuizLane(quiz));
  }
  const videoLanes = videos.map((video) => ({ video, lane: buildVideoLane(video) }));
  for (const { lane } of videoLanes) lanes.push(lane);

  const nodesById = new Map<string, TimelineNode>();
  for (const lane of lanes) for (const node of lane.nodes) nodesById.set(node.id, node);

  // A block with no Aufbau at all (entranceEffect.type "off") resolves to a null trigger (see
  // getBlockEntranceTrigger) and is filtered out here - nothing to show, nothing to attach. Any
  // other type always has a real trigger now (defaulting to "Weiter" - see the same getter), so
  // simply having one left is enough to earn a visible node; no need to separately special-case
  // "none" the way this used to.
  const entranceTargets: { block: Block; trigger: ResolvedTrigger }[] = [];
  for (const block of blocks) {
    const trigger = getBlockEntranceTrigger(page, block);
    if (trigger) entranceTargets.push({ block, trigger });
  }
  const exitTargets: { block: Block; trigger: ResolvedTrigger }[] = [];
  for (const block of blocks) {
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
    lane.edges.unshift(
      trigger.kind === "advance"
        ? { from: sourceNode.id, to: videoStartNodeId(video.id), kind: "advance" }
        : { from: sourceNode.id, to: videoStartNodeId(video.id), kind: "timed", delayMs: trigger.delayMs },
    );
  }

  // Every block-effect/"end" node that's triggered by something, keyed by that something's own
  // node id - collected up front rather than attached one at a time, so a whole straight run of
  // them can be walked and rendered as ONE continuous lane below (see extendChain) instead of
  // each getting its own separate detached row the moment it's configured.
  const attachmentsBySource = new Map<string, { targetNode: TimelineNode; trigger: ResolvedTrigger }[]>();
  function registerAttachment(targetNode: TimelineNode, sourceId: string, trigger: ResolvedTrigger) {
    const list = attachmentsBySource.get(sourceId);
    if (list) list.push({ targetNode, trigger });
    else attachmentsBySource.set(sourceId, [{ targetNode, trigger }]);
  }
  for (const { block, trigger } of entranceTargets) {
    if (nodesById.has(trigger.from)) registerAttachment(makeBlockEffectNode(block, "entrance"), trigger.from, trigger);
  }
  for (const { block, trigger } of exitTargets) {
    if (nodesById.has(trigger.from)) registerAttachment(makeBlockEffectNode(block, "exit"), trigger.from, trigger);
  }
  // "Nächste Folie"'s own trigger (see getEndTrigger's own doc comment - a quiz outcome's own
  // "end:quiz:..." node is entirely separate and untouched by any of this) joins the very same
  // attachment pool as any block's own Aufbau/Abbau - "Gar nicht" (null) or an unresolvable source
  // simply registers nothing, leaving "end" to fall through to the "never reached by the chain
  // walk below" case, still shown but with no incoming line (see the bypassLane.nodes.includes
  // check further down).
  const endTrigger = getEndTrigger(page);
  if (endTrigger && nodesById.has(endTrigger.from)) registerAttachment(endNode, endTrigger.from, endTrigger);

  const attachedIds = new Set<string>();
  for (const kids of attachmentsBySource.values()) for (const kid of kids) attachedIds.add(kid.targetNode.id);

  function edgeFor(fromId: string, toId: string, trigger: ResolvedTrigger): TimelineEdge {
    return trigger.kind === "advance" ? { from: fromId, to: toId, kind: "advance" } : { from: fromId, to: toId, kind: "timed", delayMs: trigger.delayMs };
  }

  /** Extends `lane` (whose own last node is `currentNode`) forward through as long a straight run
   * of single-child attachments as it goes. A video stop point sitting in the *middle* of its own
   * video's lane never extends the lane further this way - it stacks its child(ren) underneath
   * itself instead (see TimelineNode.children's own doc comment: a lane starting from a copy of a
   * stop point would make that video's own row look like it has two of the same stop point on two
   * different rows). A FORK (more than one thing attached to the very same source) starts one
   * brand new lane per branch, each seeded with its own copy of the fork point, so
   * groupForkedLanes in Timeline.tsx renders them as a shared trunk splitting apart - exactly like
   * two quiz outcomes already do - rather than trying to represent a branch within one lane. */
  function extendChain(lane: TimelineLane, currentNode: TimelineNode): void {
    for (;;) {
      const kids = attachmentsBySource.get(currentNode.id);
      if (!kids || kids.length === 0) return;
      if (currentNode.kind === "event" && currentNode.eventType === "video-stop-point") {
        for (const { targetNode, trigger } of kids) {
          (currentNode.children ??= []).push({ node: targetNode, delayMs: trigger.kind === "timed" ? trigger.delayMs : 0 });
        }
        return;
      }
      if (kids.length === 1) {
        const { targetNode, trigger } = kids[0];
        lane.nodes.push(targetNode);
        lane.edges.push(edgeFor(currentNode.id, targetNode.id, trigger));
        currentNode = targetNode;
        continue;
      }
      for (const { targetNode, trigger } of kids) {
        const branchLane: TimelineLane = { nodes: [{ ...currentNode }, targetNode], edges: [edgeFor(currentNode.id, targetNode.id, trigger)] };
        lanes.push(branchLane);
        extendChain(branchLane, targetNode);
      }
      return;
    }
  }

  // "start" extends the page's own bypass lane directly, in place - the common, unbranched Weiter
  // sequence (plus "end" itself, once reached) then reads as one continuous row alongside the
  // page's own start/end spine, instead of a lane of its own detached from it.
  extendChain(bypassLane, startNode);
  // "end" wasn't reached through that walk at all - either "Gar nicht", or its own trigger names
  // something entirely outside the "start" chain (e.g. a video's own stop point). Still shown, at
  // the tail of the same row, just with no connecting line (see .is-none in App.css) - it has to
  // stay visible/clickable to be reconfigured either way.
  // Checked against attachedIds (not just bypassLane.nodes) - when "start" itself FORKS (several
  // things all triggered by it), "end" can have been reached inside one of the branch lanes
  // instead, and appending it here too would show it twice.
  if (!attachedIds.has(endNode.id)) bypassLane.nodes.push(endNode);

  // Every other attachment root (a video's own start, a quiz event, ...) that isn't itself
  // something else's own target gets its own fresh lane, extended the same way.
  for (const sourceId of attachmentsBySource.keys()) {
    if (sourceId === "start" || attachedIds.has(sourceId)) continue;
    const sourceNode = nodesById.get(sourceId);
    if (!sourceNode) continue;
    const lane: TimelineLane = { nodes: [{ ...sourceNode }], edges: [] };
    lanes.push(lane);
    extendChain(lane, sourceNode);
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

  return { lanes, nodesById };
}

/** The rows of a page's event graph (see TimelineLane) - computed from the page's blocks and its
 * trigger edges, not stored in the document (so two people editing the same page never have to
 * agree on - or merge - a derived structure). Memoized per page snapshot: the same array comes back
 * until something on the page changed, so a component can call it on every render. */
const lanesCache = new WeakMap<Page, TimelineLane[]>();
export function getPageLanes(page: Page): TimelineLane[] {
  if (!isSnapshot(page)) return buildPageLanes(page).lanes;
  let lanes = lanesCache.get(page);
  if (!lanes) {
    lanes = buildPageLanes(page).lanes;
    lanesCache.set(page, lanes);
  }
  return lanes;
}

/**
 * Drops every trigger edge on the page that can no longer mean anything: its `to` no longer names a
 * block/video still on this page (or "end"), or its `from` no longer names any node that still
 * exists (e.g. the block or video either end of it used to point at was deleted). Call this after
 * any action that removes or reconfigures a block, or after page.timeline.triggerEdges itself
 * changes (see actions.ts). Only this housekeeping is stored - the graph itself (getPageLanes) is
 * derived, and already ignores such edges, so a page that skipped this would merely carry dead data.
 */
export function syncPageTimelineEvents(page: Page): void {
  const { nodesById } = buildPageLanes(page);
  const validTargets = new Set<string>(["end"]);
  const blocks = orderedValues(page.blocks);
  for (const block of blocks) {
    validTargets.add(blockEffectNodeId(block.id, "entrance"));
    validTargets.add(blockEffectNodeId(block.id, "exit"));
    if (block.kind === "video") validTargets.add(videoStartNodeId(block.id));
  }
  // Only entries that really are dead are touched - an unchanged page stays an unchanged object.
  for (const [to, edge] of Object.entries(page.timeline.triggerEdges)) {
    if (!validTargets.has(to) || !nodesById.has(edge.from)) delete page.timeline.triggerEdges[to];
  }
}
