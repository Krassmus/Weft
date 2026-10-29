import { isSnapshot } from "../collab/mutationScope";
import { formatTimeMMSS } from "../formatTime";
import { orderedValues } from "./ordering";
import type { ActionEffect, Block, BlockEffect, RevealerBlock, BlockGroup, CheckerBlock, SolutionBlock, ClozeBlock, MatchingBlock, SortBlock, ListBlock, Page, PageTimeline, PageTrigger, QuizBlock, TimelineEdge, TimelineEdgeKind, TimelineEventType, TimelineLane, TimelineNode } from "../types";
import { isMediaBlock } from "../types";
import type { MediaBlock } from "../types";
import { tr } from "../i18n/tr";
import { isTaskBlock, taskSpecOf } from "../blocks/registry";

/**
 * What every page's timeline starts out as (and what a page missing it is given on load, see io/unpack.ts): one trigger from the
 * start of the page to "Nächste Folie" that waits for Weiter - so a page with nothing on it is left with one press - and that one
 * "Nächste Folie" event, with an instant cut. There are no implicit triggers: whatever else happens on the page has a trigger of
 * its own, put there when it was set up (see syncPageTimelineEvents).
 */
export function createDefaultPageTimeline(): PageTimeline {
  return {
    triggers: { "t:end": { from: "start", to: "end", delayMs: 0, weiter: true } },
    ends: { end: { transition: { type: "none", durationMs: 500 } } },
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
 * Builds one quiz block's own lane: "Ausfüllen" (the learner picked a first option) leads to "Quiz abgeschickt" (they submitted),
 * both on no fixed schedule ("unknown"/dashed) since both are up to the learner - neither is tied to "start", since filling out a
 * quiz isn't the only thing that can happen at the top of a page. Only when `final` is given does the lane reach on to an "end"
 * node at all - a quiz's outcome doesn't trigger the next slide unless the author actually turned that on (see
 * buildPageLanes), so an undefined outcome simply stops at "submitted", rather than implying a connection to "end" that doesn't
 * exist yet. `outcome`, when given, also switches the submit node to its own outcome-specific TimelineEventType (so the
 * "richtig"/"falsch" lanes get visually distinct icons - see EVENT_ICONS in Timeline.tsx, not just distinct labels) AND its own
 * outcome-specific id (see quizSubmitNodeId - when both outcomes are wired to their own lane, each needs a genuinely distinct
 * node, not two different-looking nodes that happen to share one id and so always select together).
 */
function buildQuizLane(
  quiz: QuizBlock | ClozeBlock | CheckerBlock | SolutionBlock | MatchingBlock | SortBlock,
  final?: { endId: string; kind: TimelineEdgeKind; delayMs?: number },
  outcome?: "richtig" | "falsch",
): TimelineLane {
  const fillId = quizFillNodeId(quiz.id);
  const submitId = quizSubmitNodeId(quiz.id, outcome);
  // (A block that describes itself - see blocks/registry.ts - names its events itself.)
  const task = taskSpecOf(quiz);
  const nodes: TimelineNode[] = [
    { id: fillId, kind: "event", sourceBlockId: quiz.id, eventType: "quiz-fill-start", ...(task ? { label: tr(task.labels.fill) } : quiz.kind === "matching" ? { label: tr("ui.matching_first") } : quiz.kind === "sort" ? { label: tr("ui.sort_first") } : {}) },
    {
      id: submitId,
      kind: "event",
      sourceBlockId: quiz.id,
      eventType: outcome ? QUIZ_OUTCOME_EVENT_TYPES[outcome] : "quiz-submit",
      // (A block that describes itself - a gap text, a checker - has the events of a quiz under its own names; a checker's "richtig" is a ticked box.)
      ...(task
        ? { label: tr(outcome === "richtig" ? task.labels.correct : outcome === "falsch" ? task.labels.incorrect : task.labels.submit) }
        : quiz.kind === "sort"
        ? { label: tr(outcome === "richtig" ? "ui.sort_submitted_correct" : outcome === "falsch" ? "ui.sort_submitted_incorrect" : "ui.sort_submitted") }
        : quiz.kind === "matching"
        ? { label: tr(outcome === "richtig" ? "ui.matching_submitted_correct" : outcome === "falsch" ? "ui.matching_submitted_incorrect" : "ui.matching_submitted") }
        : outcome
          ? { label: tr("ui.submitted", { n0: tr("ui.quiz"), outcome: tr(outcome === "richtig" ? "ui.outcome_correct" : "ui.outcome_incorrect") }) }
          : {}),
    },
  ];
  const edges: TimelineLane["edges"] = [{ from: fillId, to: submitId, kind: "unknown" }];
  if (final) {
    nodes.push({ id: final.endId, kind: "end" });
    edges.push({ from: submitId, to: final.endId, kind: final.kind, ...(final.delayMs !== undefined ? { delayMs: final.delayMs } : {}) });
  }
  return { nodes, edges };
}

export function videoStartNodeId(videoBlockId: string): string {
  return `video-start:${videoBlockId}`;
}

/** A video goes on after a stop point (that stops it) had paused it - the learner pressing play again. */
export function videoResumeNodeId(videoBlockId: string, stopPointId: string): string {
  return `video-resume:${videoBlockId}:${stopPointId}`;
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
function buildVideoLane(video: MediaBlock, page: Page): TimelineLane {
  // (A sound has the same events - only they are called after it.)
  const audio = video.kind === "audio";
  const startId = videoStartNodeId(video.id);
  const endId = videoEndNodeId(video.id);

  const nodes: TimelineNode[] = [
    {
      id: startId,
      kind: "event",
      sourceBlockId: video.id,
      eventType: video.autoplay ? "video-start-auto" : "video-start-manual",
      ...(audio ? { label: tr("ui.start_of_the_audio") } : {}),
    },
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
      stopsVideo: stopPoint.stopsVideo,
      shownKinds: stopPointShownKinds(page, stopId),
      label: tr("ui.time_mark", { n0: formatTimeMMSS(stopPoint.timeSeconds) }),
    });
    edges.push({ from: previousId, to: stopId, kind: "timed", delayMs: Math.max(0, (stopPoint.timeSeconds - previousTimeSeconds) * 1000) });
    previousId = stopId;
    previousTimeSeconds = stopPoint.timeSeconds;
    // A stop point that stops the video has the video going on as an event of its own - the learner presses play. The graph shows
    // it in the same node as the time mark as long as nothing else leads from it (see foldCompanions in the editor's model.ts).
    if (stopPoint.stopsVideo) {
      const resumeId = videoResumeNodeId(video.id, stopPoint.id);
      nodes.push({
        id: resumeId,
        kind: "event",
        sourceBlockId: video.id,
        eventType: "video-resume",
        label: tr(audio ? "ui.audio_continues" : "ui.video_continues", { n0: formatTimeMMSS(stopPoint.timeSeconds) }),
      });
      edges.push({ from: stopId, to: resumeId, kind: "unknown" });
      previousId = resumeId;
    }
  }

  nodes.push({
    id: endId,
    kind: "event",
    sourceBlockId: video.id,
    eventType: video.loop ? "video-end-loop" : "video-end-stop",
    ...(audio ? { label: tr("ui.end_of_the_audio") } : {}),
  });
  edges.push({ from: previousId, to: endId, kind: "unknown" });

  return { nodes, edges };
}

const BLOCK_KIND_LABELS: Record<Block["kind"], string> = {
  get text() { return tr("ui.text"); },
  get language() { return tr("ui.language_switcher"); },
  get code() { return tr("ui.code"); },
  get tex() { return tr("ui.formula"); },
  get image() { return tr("ui.image"); },
  get video() { return tr("ui.video"); },
  get audio() { return tr("ui.audio"); },
  get revealer() { return tr("ui.revealer"); },
  get progress() { return tr("ui.progress_bar"); },
  iframe: "Iframe",
  button: "Button",
  get link() { return tr("ui.link"); },
  get quiz() { return tr("ui.quiz"); },
  get checker() { return tr("ui.checker"); },
  get matching() { return tr("ui.matching"); },
  get sort() { return tr("ui.sort"); },
  get gallery() { return tr("ui.gallery"); },
  get solution() { return tr("ui.solution"); },
  get cloze() { return tr("ui.gap_text"); },
  get shape() { return tr("ui.shape"); },
  get arrow() { return tr("ui.arrow"); },
  get files() { return tr("ui.files"); },
  get list() { return tr("ui.list"); },
  get placeholder() { return tr("ui.text_placeholder"); },
  get script() { return tr("ui.script_block"); },
};

/** What a block is called in the graph: the author's name for it, else its kind. */
export function blockNameOf(block: Block): string {
  return block.name?.trim() || BLOCK_KIND_LABELS[block.kind];
}

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
    label: `${blockNameOf(block)} ${phase === "entrance" ? "erscheint" : "verschwindet"}`,
  };
}

/** One Aktionseffekt of a block (see ActionEffect). Kept in sync by hand with player.runtime.js. */
export function blockActionNodeId(blockId: string, effectId: string): string {
  return `block-action:${blockId}:${effectId}`;
}

const ACTION_EVENT_TYPES = { move: "block-action-move", shake: "block-action-shake", blink: "block-action-blink" } as const satisfies Record<ActionEffect["type"], TimelineEventType>;

/** What the author is told about an Aktionseffekt that cannot work (see actionEffectProblem). */
export type ActionEffectProblem = "before-entrance" | "after-exit";

/** The event of the Aufbau of `block` as the Aktionseffekte of the block have to wait for it - none where the block has none that is one
 * node (no Aufbau; a list whose items appear one by one; a logic block). */
function entranceNodeIdOf(block: Block): string | null {
  if (block.kind === "script" || block.entranceEffect.type === "off" || isListPerItem(block)) return null;
  return blockEffectNodeId(block.id, "entrance");
}

/**
 * Whether an Aktionseffekt is where it cannot work: it can happen before the block has appeared (the event of its Aufbau is not what it
 * waits for, directly or through others) or after the block has gone (it waits for the event of its Abbau). Judged by what causes what,
 * as everywhere in the graph - not by the time that passes on separate chains. An effect nothing triggers is not a problem of that kind
 * (the graph shows it as unreachable).
 */
export function actionEffectProblem(page: Page, block: Block, effectId: string): ActionEffectProblem | null {
  const id = blockActionNodeId(block.id, effectId);
  if (!findTriggerEdge(page.timeline, id)) return null;
  if (block.exitEffect.type !== "off" && waitsOn(page, id, blockEffectNodeId(block.id, "exit"))) return "after-exit";
  const entranceId = entranceNodeIdOf(block);
  if (entranceId && !waitsOn(page, id, entranceId)) return "before-entrance";
  return null;
}

/** Whether `candidateId` may be offered as what triggers the Aktionseffekt `effectId` of `block`: nothing that would be a loop (see
 * canTriggerFrom), nothing that comes after the Abbau of the block, and - where the block has an Aufbau - nothing but the Aufbau itself
 * and what comes after it. */
export function canTriggerActionEffectFrom(page: Page, block: Block, effectId: string, candidateId: string): boolean {
  const id = blockActionNodeId(block.id, effectId);
  if (!canTriggerFrom(page, candidateId, id)) return false;
  if (block.exitEffect.type !== "off" && waitsOn(page, candidateId, blockEffectNodeId(block.id, "exit"))) return false;
  const entranceId = entranceNodeIdOf(block);
  return !entranceId || waitsOn(page, candidateId, entranceId);
}

/** Whether an order of the events of one chain (see findChain) keeps every Aktionseffekt between the Aufbau and the Abbau of its block -
 * for those of the block that are in the chain. A drag in the graph that would break this is refused. */
export function isChainOrderAllowed(order: string[]): boolean {
  const placeOf = (id: string) => order.indexOf(id);
  for (const id of order) {
    const match = /^block-action:([^:]+):[^:]+$/.exec(id);
    if (!match) continue;
    const entrance = placeOf(`block-entrance:${match[1]}`);
    const exit = placeOf(`block-exit:${match[1]}`);
    const here = placeOf(id);
    if ((entrance >= 0 && entrance > here) || (exit >= 0 && exit < here)) return false;
  }
  return true;
}

/** What "Weiter" means as the trigger of the Aktionseffekt `effectId`: it waits for Weiter after what the block did before it (the effect
 * before it, else the Aufbau) - not at the end of the page's chain, which may lie behind the Abbau of the block. */
export function actionEffectAdvanceSource(page: Page, block: Block, effectId: string): string {
  const effects = block.actionEffects ?? [];
  const id = blockActionNodeId(block.id, effectId);
  const hasIncoming = (to: string) => Object.values(page.timeline.triggers).some((t) => t.to === to);
  for (let i = effects.findIndex((e) => e.id === effectId) - 1; i >= 0; i--) {
    const earlier = blockActionNodeId(block.id, effects[i].id);
    if (hasIncoming(earlier) && canTriggerFrom(page, earlier, id)) return earlier;
  }
  const entranceId = entranceNodeIdOf(block);
  if (entranceId && canTriggerFrom(page, entranceId, id)) return entranceId;
  return computeAdvanceChainTail(page, id);
}

function makeBlockActionNode(page: Page, block: Block, effect: ActionEffect): TimelineNode {
  const problem = actionEffectProblem(page, block, effect.id);
  return {
    id: blockActionNodeId(block.id, effect.id),
    kind: "event",
    sourceBlockId: block.id,
    eventType: ACTION_EVENT_TYPES[effect.type],
    label: tr(effect.type === "move" ? "ui.action_moves" : effect.type === "shake" ? "ui.action_shakes" : "ui.action_blinks", { n0: blockNameOf(block) }),
    ...(problem ? { problem } : {}),
  };
}

/** The Aufbau of one item of a list (see ListBlock.itemEntrance). Kept in sync by hand with player.runtime.js. */
export function listItemNodeId(blockId: string, itemId: string): string {
  return `list-item:${blockId}:${itemId}`;
}

/** Whether the Aufbau of `block` is made by each of its items on its own: a list on a page with an Aufbau and the switch on. (The
 * block has then no Aufbau event of its own.) */
export function isListPerItem(block: Block): boolean {
  return block.kind === "list" && !!block.itemEntrance && block.entranceEffect.type !== "off";
}

function makeListItemNode(block: ListBlock, index: number, itemId: string): TimelineNode {
  return {
    id: listItemNodeId(block.id, itemId),
    kind: "event",
    sourceBlockId: block.id,
    eventType: "list-item-entrance",
    label: tr("ui.list_item", { n0: index + 1 }),
  };
}

/** The event of a logic block: its script runs (a green event that is triggered like an Aufbau). Kept in sync by hand with player.runtime.js. */
export function scriptRunNodeId(blockId: string): string {
  return `script-run:${blockId}`;
}

function makeScriptNode(block: Block): TimelineNode {
  return { id: scriptRunNodeId(block.id), kind: "event", sourceBlockId: block.id, eventType: "script-run", label: blockNameOf(block) };
}

/** The event of a button being clicked (a user event: nothing can make it happen but the learner). */
export function buttonClickNodeId(blockId: string): string {
  return `button-click:${blockId}`;
}

/** The event of the condition ("Ausgelöst durch: Variable") that triggers the event `targetId` - see PageTimeline.conditions. */
export function conditionNodeId(targetId: string): string {
  return `condition:${targetId}`;
}

export function isConditionNodeId(id: string): boolean {
  return id.startsWith("condition:");
}

/** The words an event of a condition shows in the graph: the formula, shortened. */
function conditionLabel(formula: string): string {
  const text = formula.replace(/\s+/g, " ").trim();
  return tr("ui.condition_event", { n0: text.length > 28 ? `${text.slice(0, 27)}…` : text });
}

function makeConditionNode(id: string, formula: string): TimelineNode {
  return { id, kind: "event", eventType: "variable-condition", label: conditionLabel(formula) };
}

/** A group's own Aufbau/Abbau event (see BlockGroup.entranceEffect). Kept in sync by hand with player.runtime.js - the player never
 * needs it (it has no action of its own), only the graph does. */
export function groupEffectNodeId(groupId: string, phase: "entrance" | "exit"): string {
  return `group-${phase}:${groupId}`;
}

/** The event of a revealer's window opening - by a click on its icon or by a trigger, so it is triggerable like a video's start. */
export function revealerOpenNodeId(blockId: string): string {
  return `revealer-open:${blockId}`;
}

/** The event of the button in a revealer's window being clicked (a user event). */
export function revealerButtonNodeId(blockId: string): string {
  return `revealer-button:${blockId}`;
}

function makeRevealerNodes(block: RevealerBlock): TimelineNode[] {
  const nodes: TimelineNode[] = [
    { id: revealerOpenNodeId(block.id), kind: "event", sourceBlockId: block.id, eventType: "revealer-open", label: tr("ui.revealer_opens") },
  ];
  if (block.button) {
    nodes.push({ id: revealerButtonNodeId(block.id), kind: "event", sourceBlockId: block.id, eventType: "revealer-button", label: tr("ui.revealer_button_clicked") });
  }
  return nodes;
}

function makeButtonNode(block: Block): TimelineNode {
  const name = block.name?.trim();
  return { id: buttonClickNodeId(block.id), kind: "event", sourceBlockId: block.id, eventType: "button-click", ...(name ? { label: tr("ui.named_clicked", { n0: name }) } : {}) };
}

function makeGroupEffectNode(group: BlockGroup, phase: "entrance" | "exit"): TimelineNode {
  return {
    id: groupEffectNodeId(group.id, phase),
    kind: "event",
    sourceGroupId: group.id,
    eventType: phase === "entrance" ? "group-entrance" : "group-exit",
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
  "revealer-open",
  "block-entrance",
  "block-exit",
  "block-action-move",
  "block-action-shake",
  "block-action-blink",
  "group-entrance",
  "group-exit",
  "list-item-entrance",
  "script-run",
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

/** The page's triggers as the (single) edges the editor's graph draws, ordered by the event they cause so that every reader walks
 * them in the same order wherever the stored map happens to enumerate them. */
export function triggerEdgeList(timeline: PageTimeline): TimelineEdge[] {
  return Object.keys(timeline.triggers)
    .sort()
    .map((id) => {
      const trigger = timeline.triggers[id];
      return trigger.weiter
        ? ({ from: trigger.from, to: trigger.to, kind: "advance" } as TimelineEdge)
        : ({ from: trigger.from, to: trigger.to, kind: "timed", delayMs: trigger.delayMs } as TimelineEdge);
    });
}

/** The triggers that lead to `to` (with their ids), in a fixed order. */
export function incomingTriggers(timeline: PageTimeline, to: string): (PageTrigger & { id: string })[] {
  return Object.keys(timeline.triggers)
    .filter((id) => timeline.triggers[id].to === to)
    .sort()
    .map((id) => ({ id, ...timeline.triggers[id] }));
}

/** The triggers that start at `from` (with their ids), in a fixed order. */
export function outgoingTriggers(timeline: PageTimeline, from: string): (PageTrigger & { id: string })[] {
  return Object.keys(timeline.triggers)
    .filter((id) => timeline.triggers[id].from === from)
    .sort()
    .map((id) => ({ id, ...timeline.triggers[id] }));
}

/** The ids of the triggers that lead to `to`, in a fixed order. An event can have several; the panels of a block edit the first. */
function incomingTriggerIds(timeline: PageTimeline, to: string): string[] {
  return Object.keys(timeline.triggers)
    .filter((id) => timeline.triggers[id].to === to)
    .sort();
}

function findTriggerEdge(timeline: PageTimeline, targetNodeId: string): TimelineEdge | undefined {
  const id = incomingTriggerIds(timeline, targetNodeId)[0];
  if (id === undefined) return undefined;
  const trigger = timeline.triggers[id];
  return trigger.weiter
    ? { from: trigger.from, to: targetNodeId, kind: "advance" }
    : { from: trigger.from, to: targetNodeId, kind: "timed", delayMs: trigger.delayMs };
}

/** What actually causes a trigger to fire - either a fixed delay after `from` ("timed"), or "whenever the learner next presses Weiter
 * after `from` has already fired" ("advance", the trigger's `weiter`). Every getBlockEntranceTrigger/getBlockExitTrigger/
 * getVideoStartTrigger/getEndTrigger function below returns this same shape (or null: "no trigger at all" is itself a real, meaningful
 * state) so the editor UI (TriggerPicker.tsx) only ever has ONE shape to branch on. */
export type ResolvedTrigger = { kind: "timed"; from: string; delayMs: number } | { kind: "advance"; from: string };

function resolvedTriggerFromEdge(edge: TimelineEdge): ResolvedTrigger {
  return edge.kind === "advance" ? { kind: "advance", from: edge.from } : { kind: "timed", from: edge.from, delayMs: edge.delayMs ?? 0 };
}

/** Whether event `startId` can only happen after event `targetId` has - following what causes what, through the (first) trigger
 * of every event. A node with no trigger is a root (an event nothing on the page waits for). Chaining `targetId` after something
 * for which this is true would close a loop - a set of events each waiting for the next, none of which could ever fire. */
function waitsOn(page: Page, startId: string, targetId: string): boolean {
  const seen = new Set<string>();
  let id: string | undefined = startId;
  while (id !== undefined && !seen.has(id)) {
    if (id === targetId) return true;
    seen.add(id);
    id = findTriggerEdge(page.timeline, id)?.from;
  }
  return false;
}

/** Whether `candidateId` may be offered as the source of `targetId`'s trigger: not itself, and not anything that already waits on it
 * (see waitsOn) - either would be a loop. */
export function canTriggerFrom(page: Page, candidateId: string, targetId: string): boolean {
  return !waitsOn(page, candidateId, targetId);
}

/** The ids of the page's "Nächste Folie" events (see PageTimeline.ends): "end" first, then the others. */
export function endNodeIds(page: Page): string[] {
  return Object.keys(page.timeline.ends).sort((a, b) => (a === "end" ? -1 : b === "end" ? 1 : a < b ? -1 : 1));
}

/** Where a new Weiter-triggered event goes in the chain: after the event "Nächste Folie" waits for (so that leaving the page stays the
 * last link), else after the last link of the chain that starts at "start" - "start" if there is none. `excludeNodeId` leaves one
 * node out of consideration (the node currently being (re)configured, so re-picking "Weiter" for something already chained doesn't
 * try to chain it onto itself); it also never returns something that waits for that node (that would be a loop) - "start" then. */
export function computeAdvanceChainTail(page: Page, excludeNodeId: string | null): string {
  let tail = "start";
  const endEdge = findTriggerEdge(page.timeline, "end");
  if (endEdge && endEdge.kind === "advance" && excludeNodeId !== "end") {
    tail = endEdge.from;
  } else {
    // Follow the Weiter links from "start" as far as they go.
    const seen = new Set<string>(["start"]);
    for (;;) {
      const next = Object.values(page.timeline.triggers).find((t) => t.weiter && t.from === tail && t.to !== excludeNodeId && !seen.has(t.to) && !isEndNodeId(t.to));
      if (!next) break;
      tail = next.to;
      seen.add(tail);
    }
  }
  if (excludeNodeId === null) return tail;
  return tail === excludeNodeId || waitsOn(page, tail, excludeNodeId) ? "start" : tail;
}

/** Whether `nodeId` names one of a page's "Nächste Folie" events ("end", or e.g. a quiz outcome's own). */
export function isEndNodeId(nodeId: string): boolean {
  return nodeId === "end" || nodeId.startsWith("end:");
}

/** A block's own Aufbau trigger - null when there's no Aufbau at all (`entranceEffect.type === "off"`, see BlockEffectType's own doc
 * comment in core/types.ts): short-circuits here regardless of whatever trigger might still be stored. Otherwise what the page
 * stores. A block merged in from the page's own LAYOUT keeps the unconditional "at the start, no delay" - a layout block's own trigger
 * can never be stored per page. */
export function getBlockEntranceTrigger(page: Page, block: Block): ResolvedTrigger | null {
  if (block.entranceEffect.type === "off") return null;
  const edge = findTriggerEdge(page.timeline, blockEffectNodeId(block.id, "entrance"));
  if (edge) return resolvedTriggerFromEdge(edge);
  if (!(block.id in page.blocks)) return { kind: "timed", from: "start", delayMs: 0 };
  return null;
}

/** A block's own Abbau trigger - null both for "no Abbau at all" (`exitEffect.type === "off"`, the default) and when nothing
 * triggers it (a layout block's own Abbau can never durably persist per page). */
export function getBlockExitTrigger(page: Page, block: Block): ResolvedTrigger | null {
  if (block.exitEffect.type === "off") return null;
  const edge = findTriggerEdge(page.timeline, blockEffectNodeId(block.id, "exit"));
  return edge ? resolvedTriggerFromEdge(edge) : null;
}

/** The trigger of an Aktionseffekt of a block, as stored (null: none - it then never happens). */
export function getActionEffectTrigger(page: Page, blockId: string, effectId: string): ResolvedTrigger | null {
  const edge = findTriggerEdge(page.timeline, blockActionNodeId(blockId, effectId));
  return edge ? resolvedTriggerFromEdge(edge) : null;
}

/** The trigger of a group's own Aufbau/Abbau event, as stored (null: none). */
export function getGroupEffectTrigger(page: Page, groupId: string, phase: "entrance" | "exit"): ResolvedTrigger | null {
  const edge = findTriggerEdge(page.timeline, groupEffectNodeId(groupId, phase));
  return edge ? resolvedTriggerFromEdge(edge) : null;
}

/** A video's own "Start des Videos" trigger - none when the learner has to press play. `VideoBlock.autoplay` is only the switch that
 * puts a trigger from the start of the page there (see syncPageTimelineEvents), no implicit default of its own. */
export function getVideoStartTrigger(page: Page, video: MediaBlock): ResolvedTrigger | null {
  const edge = findTriggerEdge(page.timeline, videoStartNodeId(video.id));
  return edge ? resolvedTriggerFromEdge(edge) : null;
}

/** What causes "Nächste Folie" `endId` ("end", the page's own, by default): null means nothing does - the page can then only be left
 * some other way (a button block, a quiz's own "go on after the feedback"). */
export function getEndTrigger(page: Page, endId = "end"): ResolvedTrigger | null {
  const edge = findTriggerEdge(page.timeline, endId);
  return edge ? resolvedTriggerFromEdge(edge) : null;
}

/** Sets the (first) trigger that causes `to` to one from `from` (`kind` "timed" by default; pass "advance" for a Weiter-triggered one -
 * `delayMs` is then the delay that runs after the press), or removes it when `from` is null - the place the panels of a block, which
 * edit one trigger per event, do their bookkeeping (see setEventTrigger in document/actions.ts). Other incoming triggers of `to` (the
 * model allows several, the event's own panel edits them) are left alone. */
export function setTriggerEdge(
  timeline: PageTimeline,
  to: string,
  from: string | null,
  delayMs: number,
  kind: TimelineEdgeKind = "timed",
): void {
  const first = incomingTriggerIds(timeline, to)[0];
  if (from) timeline.triggers[first ?? `t:${to}`] = { from, to, delayMs, weiter: kind === "advance" };
  else if (first !== undefined) delete timeline.triggers[first];
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
  // A gap text has the events of a quiz (the first answer, submitted, right / wrong): the same lanes.
  const quizzes = blocks.filter((b): b is QuizBlock | ClozeBlock | CheckerBlock | SolutionBlock | MatchingBlock | SortBlock => isTaskBlock(b));
  const videos = blocks.filter((b): b is MediaBlock => isMediaBlock(b));

  const startNode: TimelineNode = { id: "start", kind: "start" };
  const endNode: TimelineNode = { id: "end", kind: "end" };
  // "end" is deliberately NOT in here yet (unlike before) - it's attached into place below,
  // exactly like a block's own Aufbau/Abbau, so it lands whichever its own resolved trigger
  // actually says, including - the common case - right after "start" when nothing else is queued.
  const bypassLane: TimelineLane = { nodes: [startNode], edges: [] };

  const lanes: TimelineLane[] = [bypassLane];
  for (const quiz of quizzes) {
    // An outcome gets a lane of its own when it goes on to a "Nächste Folie" (a trigger from its event to one of the page's ends);
    // with neither doing that there is the one plain "submitted" lane. An open question has no wrong answer: whatever is submitted
    // counts as "richtig" (see QuizBlock.open).
    let outcomeLanes = 0;
    for (const outcome of ["richtig", "falsch"] as const) {
      if (outcome === "falsch" && quiz.kind === "quiz" && quiz.open) continue;
      const submitId = quizSubmitNodeId(quiz.id, outcome);
      const trigger = Object.values(page.timeline.triggers).find((t) => t.from === submitId && page.timeline.ends[t.to]);
      // A solution word always shows both outcomes: what is to follow a right word (a block that appears, say) hangs on "richtig", and an event that is
      // not in the graph cannot be picked as a trigger.
      if (!trigger && !taskSpecOf(quiz)?.outcomesAlwaysShown) continue;
      outcomeLanes++;
      lanes.push(buildQuizLane(quiz, trigger ? { endId: trigger.to, kind: trigger.weiter ? "advance" : "timed", delayMs: trigger.delayMs } : undefined, outcome));
    }
    // (The plain "submitted" of a solution word is only there when something hangs on it.)
    const plainSubmitId = quizSubmitNodeId(quiz.id);
    if (outcomeLanes === 0 || (taskSpecOf(quiz)?.outcomesAlwaysShown && Object.values(page.timeline.triggers).some((t) => t.from === plainSubmitId))) lanes.push(buildQuizLane(quiz));
  }
  const videoLanes = videos.map((video) => ({ video, lane: buildVideoLane(video, page) }));
  for (const { lane } of videoLanes) lanes.push(lane);
  // A button's click is an event of its own (a violet one: the learner does it); what it triggers is drawn from its triggers.
  // A button that appears (it has an Aufbau) cannot be clicked before: its own event leads the lane, joined by a dashed line (the learner
  // does it), as with a revealer.
  for (const block of blocks) {
    if (block.kind !== "button") continue;
    const nodes = [makeButtonNode(block)];
    if (block.entranceEffect.type !== "off") nodes.unshift(makeBlockEffectNode(block, "entrance"));
    lanes.push({ nodes, edges: nodes.length > 1 ? [{ from: nodes[0].id, to: nodes[1].id, kind: "unknown" as const }] : [] });
  }
  // A revealer: the opening of its window and, when it has one, the click on the button in it - which only comes after (a dashed line, as
  // from a quiz's first answer to its submit: the learner does it) - and, before them, its own Aufbau if it has one.
  for (const block of blocks) {
    if (block.kind !== "revealer") continue;
    const nodes = makeRevealerNodes(block);
    // An icon that appears (it has an Aufbau) cannot be opened before: its own event leads the lane, as the source of a video's start does.
    if (block.entranceEffect.type !== "off") nodes.unshift(makeBlockEffectNode(block, "entrance"));
    lanes.push({ nodes, edges: nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, kind: "unknown" as const })) });
  }

  // The condition of an "Ausgelöst durch: Variable" is an event of its own (it happens when the formula turns true): a node to start from,
  // like a button's click - what it triggers is drawn from its trigger.
  for (const [id, formula] of Object.entries(page.timeline.conditions ?? {})) lanes.push({ nodes: [makeConditionNode(id, formula)], edges: [] });

  const nodesById = new Map<string, TimelineNode>();
  for (const lane of lanes) for (const node of lane.nodes) nodesById.set(node.id, node);

  // A block with no Aufbau/Abbau at all (effect type "off") has no event. Any other type has one - with the trigger the page
  // stores for it, if any (without one it is shown on a row of its own and never happens: see the unreachable events in
  // docs/event-graph.md).
  // The same goes for the Aufbau/Abbau of a group (an event block of its own: see BlockGroup).
  const effectTargets: { node: TimelineNode; trigger: ResolvedTrigger | null }[] = [];
  for (const block of blocks) {
    if (block.kind === "list" && isListPerItem(block)) {
      // Each item of the list is an Aufbau of its own - and the list as a whole has none.
      block.items.forEach((item, index) => {
        const edge = findTriggerEdge(page.timeline, listItemNodeId(block.id, item.id));
        effectTargets.push({ node: makeListItemNode(block, index, item.id), trigger: edge ? resolvedTriggerFromEdge(edge) : null });
      });
    } else if (block.kind === "script") {
      // A logic block has an event of its own (its script runs) instead of an Aufbau, with the trigger the page stores for it.
      const edge = findTriggerEdge(page.timeline, scriptRunNodeId(block.id));
      effectTargets.push({ node: makeScriptNode(block), trigger: edge ? resolvedTriggerFromEdge(edge) : null });
    } else if (block.entranceEffect.type !== "off") {
      effectTargets.push({ node: makeBlockEffectNode(block, "entrance"), trigger: getBlockEntranceTrigger(page, block) });
    }
    // The Aktionseffekte lie between the Aufbau and the Abbau (only on a page: a layout block has none of its own per page).
    if (block.id in page.blocks) {
      for (const effect of block.actionEffects ?? []) {
        const edge = findTriggerEdge(page.timeline, blockActionNodeId(block.id, effect.id));
        effectTargets.push({ node: makeBlockActionNode(page, block, effect), trigger: edge ? resolvedTriggerFromEdge(edge) : null });
      }
    }
    if (block.exitEffect.type !== "off") effectTargets.push({ node: makeBlockEffectNode(block, "exit"), trigger: getBlockExitTrigger(page, block) });
  }
  for (const group of page.groups) {
    for (const phase of ["entrance", "exit"] as const) {
      const effect = phase === "entrance" ? group.entranceEffect : group.exitEffect;
      if (!effect || effect.type === "off") continue;
      const edge = findTriggerEdge(page.timeline, groupEffectNodeId(group.id, phase));
      effectTargets.push({ node: makeGroupEffectNode(group, phase), trigger: edge ? resolvedTriggerFromEdge(edge) : null });
    }
  }
  for (const { node } of effectTargets) nodesById.set(node.id, node);

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
  for (const { node, trigger } of effectTargets) {
    if (trigger && nodesById.has(trigger.from)) registerAttachment(node, trigger.from, trigger);
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
      if (currentNode.kind === "event" && (currentNode.eventType === "video-stop-point" || currentNode.eventType === "video-resume")) {
        for (const { targetNode, trigger } of kids) {
          (currentNode.children ??= []).push({ node: targetNode, delayMs: trigger.kind === "timed" ? trigger.delayMs : 0 });
          // What goes on from there ("Text erscheint" -> "Nächste Folie") is not stacked as well: it continues in a lane of its
          // own - without it everything behind such a child was never reached and so missing in the graph.
          if ((attachmentsBySource.get(targetNode.id)?.length ?? 0) > 0) {
            const onward: TimelineLane = { nodes: [{ ...targetNode }], edges: [] };
            lanes.push(onward);
            extendChain(onward, targetNode);
          }
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
  const laneRoots = new Set<string>();
  for (const sourceId of attachmentsBySource.keys()) {
    if (sourceId === "start" || attachedIds.has(sourceId)) continue;
    const sourceNode = nodesById.get(sourceId);
    if (!sourceNode) continue;
    const lane: TimelineLane = { nodes: [{ ...sourceNode }], edges: [] };
    lanes.push(lane);
    laneRoots.add(sourceId);
    extendChain(lane, sourceNode);
  }
  // An Aufbau/Abbau nothing triggers (and nothing hangs off): still on a row of its own, so that it can be selected and given a
  // trigger.
  for (const { node } of effectTargets) {
    if (attachedIds.has(node.id) || laneRoots.has(node.id)) continue;
    lanes.push({ nodes: [node], edges: [] });
  }

  // Safety net: whatever is an event of this page but has not been put on any lane by the walks above would be missing from the
  // graph altogether (and so could be neither seen nor given a trigger) - it gets a lane of its own.
  const placed = new Set<string>();
  for (const lane of lanes) {
    for (const node of lane.nodes) {
      placed.add(node.id);
      for (const child of node.children ?? []) placed.add(child.node.id);
    }
  }
  for (const node of [...effectTargets.map((t) => t.node), endNode]) {
    if (placed.has(node.id)) continue;
    placed.add(node.id);
    lanes.push({ nodes: [node], edges: [] });
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

/** The ids of every event the page's blocks give it (not the "Nächste Folie" events, which are stored: see PageTimeline.ends). */
function blockEventIds(page: Page): Set<string> {
  const ids = new Set<string>(["start"]);
  for (const block of orderedValues(page.blocks)) {
    if (block.kind === "list" && isListPerItem(block)) {
      for (const item of block.items) ids.add(listItemNodeId(block.id, item.id));
    } else if (block.kind === "script") ids.add(scriptRunNodeId(block.id));
    else if (block.entranceEffect.type !== "off") ids.add(blockEffectNodeId(block.id, "entrance"));
    for (const effect of block.actionEffects ?? []) ids.add(blockActionNodeId(block.id, effect.id));
    if (block.exitEffect.type !== "off") ids.add(blockEffectNodeId(block.id, "exit"));
    if (isMediaBlock(block)) {
      ids.add(videoStartNodeId(block.id));
      for (const stopPoint of block.stopPoints) {
        ids.add(videoStopNodeId(block.id, stopPoint.id));
        if (stopPoint.stopsVideo) ids.add(videoResumeNodeId(block.id, stopPoint.id));
      }
      ids.add(videoEndNodeId(block.id));
    }
    if (block.kind === "button") ids.add(buttonClickNodeId(block.id));
    if (block.kind === "revealer") {
      ids.add(revealerOpenNodeId(block.id));
      if (block.button) ids.add(revealerButtonNodeId(block.id));
    }
    if (isTaskBlock(block)) {
      ids.add(quizFillNodeId(block.id));
      ids.add(quizSubmitNodeId(block.id));
      ids.add(quizSubmitNodeId(block.id, "richtig"));
      ids.add(quizSubmitNodeId(block.id, "falsch"));
    }
  }
  for (const group of page.groups) {
    if (group.entranceEffect && group.entranceEffect.type !== "off") ids.add(groupEffectNodeId(group.id, "entrance"));
    if (group.exitEffect && group.exitEffect.type !== "off") ids.add(groupEffectNodeId(group.id, "exit"));
  }
  for (const id of Object.keys(page.timeline.conditions ?? {})) ids.add(id);
  return ids;
}

/**
 * Keeps the page's stored event graph (page.timeline) consistent with its blocks - call it after any action that adds, removes or
 * reconfigures a block, or changes the triggers themselves (see actions.ts). In this order:
 *
 * 1. "Nächste Folie" events of a quiz outcome go when the quiz or the trigger leading to them is gone.
 * 2. A trigger whose source is gone (a deleted block, an effect set to "off") is not dropped on the spot: whatever led to the
 *    source now leads to what the source led to, so that a chain A - B - C stays one chain when B is removed.
 * 3. Triggers whose event or source no longer exists at all are dropped.
 * 4. Titles of events that are gone are dropped.
 *
 * A freshly chosen Aufbau/Abbau gets its place in the chain from ensureEffectTriggers, called by the action that chose it - not
 * from here: an effect whose trigger the author has taken away must stay without one (it is then shown as unreachable).
 *
 * Only what is really out of date is touched - an unchanged page stays an unchanged object.
 */
export function syncPageTimelineEvents(page: Page): void {
  const timeline = page.timeline;
  timeline.triggers ??= {};
  timeline.ends ??= {};
  if (!timeline.ends["end"]) timeline.ends["end"] = { transition: { type: "none", durationMs: 500 } };

  // 0. A trigger flagged `hideOnResume` (what the editor wrote before "Video läuft weiter" was an event of its own) becomes the
  // Abbau of that block, triggered by the video going on.
  for (const trigger of Object.values(timeline.triggers)) {
    if (!trigger.hideOnResume) continue;
    delete trigger.hideOnResume;
    const from = /^video-stop:([^:]+):([^:]+)$/.exec(trigger.from);
    const to = /^block-entrance:(.+)$/.exec(trigger.to);
    if (from && to) setDisappearsOnResume(page, to[1], videoResumeNodeId(from[1], from[2]), true);
  }

  const events = blockEventIds(page);

  // 1.
  const quizIds = new Set(orderedValues(page.blocks).filter(isTaskBlock).map((b) => b.id));
  for (const endId of Object.keys(timeline.ends)) {
    const quizEnd = /^end:quiz:(.+):(richtig|falsch)$/.exec(endId);
    if (!quizEnd) continue;
    const led = Object.values(timeline.triggers).some((t) => t.to === endId && events.has(t.from));
    if (!quizIds.has(quizEnd[1]) || !led) delete timeline.ends[endId];
  }
  for (const endId of Object.keys(timeline.ends)) events.add(endId);

  // 2.
  for (let pass = 0; pass < 25; pass++) {
    let changed = false;
    for (const trigger of Object.values(timeline.triggers)) {
      if (!events.has(trigger.to) || events.has(trigger.from)) continue;
      const via = Object.values(timeline.triggers).find((t) => t.to === trigger.from && t !== trigger && t.from !== trigger.to);
      if (via) {
        trigger.from = via.from;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 3.
  for (const [id, trigger] of Object.entries(timeline.triggers)) {
    if (!events.has(trigger.to) || !events.has(trigger.from)) delete timeline.triggers[id];
  }

  // 4. Titles of events that are gone.
  if (timeline.titles) {
    for (const id of Object.keys(timeline.titles)) if (!events.has(id)) delete timeline.titles[id];
  }

  // 5. A condition that nothing is triggered by any more (its target is gone, or has another trigger now) goes.
  if (timeline.conditions) {
    for (const id of Object.keys(timeline.conditions)) {
      if (!Object.values(timeline.triggers).some((t) => t.from === id)) delete timeline.conditions[id];
    }
    if (Object.keys(timeline.conditions).length === 0) delete timeline.conditions;
  }
}

/** Whether block `blockId` disappears when the video goes on at `resumeId` (an Abbau triggered by that "Video läuft weiter"). */
export function disappearsOnResume(page: Page, blockId: string, resumeId: string): boolean {
  const exitId = blockEffectNodeId(blockId, "exit");
  return Object.values(page.timeline.triggers).some((t) => t.from === resumeId && t.to === exitId);
}

/**
 * Makes block `blockId` disappear when the video goes on at `resumeId` - or not any more. It is the Abbau of the block, triggered by
 * the event "Video läuft weiter": a block that had no Abbau gets one that hides it at once, and loses it again when this was the
 * only thing that triggered it. The shortcut of the "verschwindet wieder, wenn das Video weiterläuft" switch; everything it does is
 * an ordinary Abbau and an ordinary trigger, which the graph draws as one node with two events (see foldCompanions in model.ts).
 */
/** The kinds of the elements the time mark `stopId` ("video-stop:<video>:<mark>") makes appear (the Aufbau of a block is triggered by it),
 * each kind once - empty if it makes nothing appear. */
export function stopPointShownKinds(page: Page, stopId: string): Block["kind"][] {
  const kinds = new Set<Block["kind"]>();
  for (const trigger of Object.values(page.timeline.triggers)) {
    if (trigger.from !== stopId || !trigger.to.startsWith("block-entrance:")) continue;
    const block = page.blocks[trigger.to.slice("block-entrance:".length)];
    if (block) kinds.add(block.kind);
  }
  return [...kinds];
}

/** What "Lässt erscheinen" makes of an Aufbau/Abbau that is off: a fade (the better default - a sudden appearing is rarely wanted). */
export const SHOWN_BY_TIME_MARK_EFFECT: BlockEffect = { type: "fade", durationMs: 500 };

/** Whether an Aufbau/Abbau looks like the one "Lässt erscheinen" made (or the plain one an earlier version made) - and may go back to off
 * when the time mark does not trigger it any more. */
export function isMadeByTimeMark(effect: BlockEffect): boolean {
  return effect.type === "none" || (effect.type === SHOWN_BY_TIME_MARK_EFFECT.type && effect.durationMs === SHOWN_BY_TIME_MARK_EFFECT.durationMs);
}

export function setDisappearsOnResume(page: Page, blockId: string, resumeId: string, on: boolean): void {
  const block = page.blocks[blockId];
  if (!block) return;
  const triggers = page.timeline.triggers;
  const exitId = blockEffectNodeId(blockId, "exit");
  const existing = Object.keys(triggers).find((id) => triggers[id].from === resumeId && triggers[id].to === exitId);
  if (on) {
    if (block.exitEffect.type === "off") block.exitEffect = { ...SHOWN_BY_TIME_MARK_EFFECT };
    if (existing === undefined) {
      let id = `t:${exitId}`;
      for (let n = 2; id in triggers; n++) id = `t:${exitId}:${n}`;
      triggers[id] = { from: resumeId, to: exitId, delayMs: 0, weiter: false };
    }
    return;
  }
  if (existing !== undefined) delete triggers[existing];
  const stillTriggered = Object.values(triggers).some((t) => t.to === exitId);
  if (isMadeByTimeMark(block.exitEffect) && !stillTriggered) block.exitEffect = { type: "off", durationMs: 500 };
}

/**
 * A button whose action is "event" and whose click triggers nothing yet goes on to "Nächste Folie" - what a button that "goes to the
 * next slide" is. Called by the action that has just made the button so (the author can then change or remove the trigger in the
 * graph: it is not made again).
 */
export function ensureButtonTrigger(page: Page, blockId: string): void {
  const block = page.blocks[blockId];
  if (!block || block.kind !== "button" || block.action !== "event") return;
  const click = buttonClickNodeId(blockId);
  if (Object.values(page.timeline.triggers).some((t) => t.from === click)) return;
  page.timeline.triggers[`t:button:${blockId}`] = { from: click, to: "end", delayMs: 0, weiter: false };
}

/**
 * Gives the Aufbau/Abbau of `blockIds` that has no trigger yet one: it waits for Weiter at the end of the chain, and "Nächste Folie"
 * stays the last link. Called by the action that has just chosen the effect (there are no implicit triggers any more, see
 * docs/event-graph.md) - never by the general sync, so that an effect from which the author took the trigger away stays so.
 */
export function ensureEffectTriggers(page: Page, blockIds: string[]): void {
  const timeline = page.timeline;
  const hasIncoming = (to: string) => Object.values(timeline.triggers).some((t) => t.to === to);
  for (const blockId of blockIds) {
    const block = page.blocks[blockId];
    if (!block) continue;
    const wanted: string[] = [];
    if (block.kind === "list" && isListPerItem(block)) for (const item of block.items) wanted.push(listItemNodeId(blockId, item.id));
    else if (block.kind === "script") wanted.push(scriptRunNodeId(blockId));
    else if (block.entranceEffect.type !== "off") wanted.push(blockEffectNodeId(blockId, "entrance"));
    if (block.exitEffect.type !== "off") wanted.push(blockEffectNodeId(blockId, "exit"));
    for (const nodeId of wanted) {
      if (hasIncoming(nodeId)) continue;
      const actionIds = (block.actionEffects ?? []).map((e) => blockActionNodeId(blockId, e.id)).filter(hasIncoming);
      if (nodeId === blockEffectNodeId(blockId, "entrance") && actionIds.length > 0) {
        // The Aufbau comes back to a block that has Aktionseffekte: it goes before the first of them, where it belongs.
        const first = incomingTriggers(timeline, actionIds[0])[0];
        timeline.triggers[`t:${nodeId}`] = { from: first.from, to: nodeId, delayMs: 0, weiter: true };
        timeline.triggers[first.id].from = nodeId;
      } else if (nodeId === blockEffectNodeId(blockId, "exit") && actionIds.length > 0) {
        // ...and the Abbau after the last of them.
        const last = actionIds[actionIds.length - 1];
        for (const out of outgoingTriggers(timeline, last)) if (out.weiter) timeline.triggers[out.id].from = nodeId;
        timeline.triggers[`t:${nodeId}`] = { from: last, to: nodeId, delayMs: 0, weiter: true };
      } else appendToWeiterChain(page, nodeId);
    }
  }
}

/**
 * The items of a list with an Aufbau for each item (see isListPerItem) that have no trigger yet take their place in the chain of
 * Weiter, in the order of the list. `onlyItemIds`: just those (a new item - one whose trigger the author has taken away stays so).
 */
export function ensureListItemTriggers(page: Page, blockId: string, onlyItemIds?: string[]): void {
  const block = page.blocks[blockId];
  if (!block || block.kind !== "list" || !isListPerItem(block)) return;
  const triggers = page.timeline.triggers;
  block.items.forEach((item, index) => {
    if (onlyItemIds && !onlyItemIds.includes(item.id)) return;
    const nodeId = listItemNodeId(blockId, item.id);
    if (Object.values(triggers).some((t) => t.to === nodeId)) return;
    // A new item between others (Enter in a list) appears right after the one before it - what waited for Weiter after that one
    // now waits after the new one. Otherwise (the first, or the one before has no place in a chain) it goes to the end.
    const previousNode = index > 0 ? listItemNodeId(blockId, block.items[index - 1].id) : null;
    const placedAfterPrevious =
      previousNode !== null && Object.values(triggers).some((t) => t.to === previousNode) && outgoingTriggers(page.timeline, previousNode).some((t) => t.weiter);
    if (previousNode && placedAfterPrevious) {
      for (const out of outgoingTriggers(page.timeline, previousNode)) {
        if (out.weiter && out.to !== nodeId) triggers[out.id].from = nodeId;
      }
      triggers[`t:${nodeId}`] = { from: previousNode, to: nodeId, delayMs: 0, weiter: true };
    } else {
      appendToWeiterChain(page, nodeId);
    }
  });
}

/**
 * Gives the Aktionseffekt `effectId` of block `blockId` its place when it has just been made: it waits for Weiter after what the block
 * did last - the Aufbau or the Aktionseffekt before it - and what waited for Weiter after that (the Abbau of the block, the Aufbau of
 * the next one, "Nächste Folie") now waits after it, so it lies between the Aufbau and the Abbau and the chain stays one. A block with no
 * Aufbau (or none that has a place in a chain) puts it before its Abbau, when that has a trigger; else at the end of the chain.
 */
export function placeActionEffect(page: Page, blockId: string, effectId: string): void {
  const block = page.blocks[blockId];
  if (!block) return;
  const timeline = page.timeline;
  const triggers = timeline.triggers;
  const nodeId = blockActionNodeId(blockId, effectId);
  if (Object.values(triggers).some((t) => t.to === nodeId)) return;
  const hasIncoming = (to: string) => Object.values(triggers).some((t) => t.to === to);
  const entranceId = entranceNodeIdOf(block);
  const exitId = block.exitEffect.type !== "off" ? blockEffectNodeId(blockId, "exit") : null;
  const effects = block.actionEffects ?? [];
  let previous: string | null = null;
  for (let i = effects.findIndex((e) => e.id === effectId) - 1; i >= 0; i--) {
    const id = blockActionNodeId(blockId, effects[i].id);
    if (hasIncoming(id)) {
      previous = id;
      break;
    }
  }
  if (!previous && entranceId && hasIncoming(entranceId)) previous = entranceId;
  if (previous) {
    for (const out of outgoingTriggers(timeline, previous)) if (out.weiter && out.to !== nodeId) triggers[out.id].from = nodeId;
    if (exitId) for (const t of incomingTriggers(timeline, exitId)) if (t.from === previous) triggers[t.id].from = nodeId;
    triggers[`t:${nodeId}`] = { from: previous, to: nodeId, delayMs: 0, weiter: true };
    return;
  }
  const exitIn = exitId ? incomingTriggers(timeline, exitId)[0] : undefined;
  if (exitIn) {
    triggers[`t:${nodeId}`] = { from: exitIn.from, to: nodeId, delayMs: 0, weiter: true };
    triggers[exitIn.id].from = nodeId;
    return;
  }
  appendToWeiterChain(page, nodeId);
}

/** `nodeId` waits for Weiter at the end of the chain; "Nächste Folie" stays the last link of the chain it was the last link of. */
export function appendToWeiterChain(page: Page, nodeId: string): void {
  const timeline = page.timeline;
  const tail = computeAdvanceChainTail(page, nodeId);
  timeline.triggers[`t:${nodeId}`] = { from: tail, to: nodeId, delayMs: 0, weiter: true };
  const endTrigger = Object.values(timeline.triggers).find((t) => t.to === "end" && t.weiter && t.from === tail);
  if (endTrigger && !waitsOn(page, tail, nodeId)) endTrigger.from = nodeId;
}

/**
 * Takes `nodeId` out of the triggers around it without breaking them: whatever it triggered is now triggered by what triggered it
 * (with the properties of its own link), and the triggers leading into it are dropped. Nothing leading into it: what it triggered
 * loses that trigger.
 */
export function spliceOutOfTriggers(page: Page, nodeId: string): void {
  const timeline = page.timeline;
  const incoming = incomingTriggers(timeline, nodeId);
  const via = incoming[0];
  for (const out of outgoingTriggers(timeline, nodeId)) {
    if (via && via.from !== out.to) timeline.triggers[out.id].from = via.from;
    else delete timeline.triggers[out.id];
  }
  for (const trigger of incoming) delete timeline.triggers[trigger.id];
}
