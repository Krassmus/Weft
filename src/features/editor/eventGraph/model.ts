import { orderedValues } from "../../../core/document/ordering";
import {
  blockEffectNodeId,
  buttonClickNodeId,
  getPageLanes,
  listAllNodes,
  quizFillNodeId,
  quizSubmitNodeId,
  videoStartNodeId,
} from "../../../core/document/pageTimeline";
import { isMediaBlock } from "../../../core/types";
import type { Block, Page, TimelineEdgeKind, TimelineNode } from "../../../core/types";

/** What kind an event is, which is what its colour says (docs/event-graph.md, section 2): the learner doing something (violet), an
 * animation (yellow), a script that runs (green), or anything else (blue). */
export type EventColor = "blue" | "yellow" | "violet" | "green";

export interface GraphNodeModel {
  id: string;
  node: TimelineNode;
  color: EventColor;
  /** The block that makes this event, if it belongs to an event block (a quiz or a video) - drawn as one unit. */
  blockId?: string;
  blockKind?: Block["kind"];
  /** Whether what it triggers may go to the right (else below it). */
  outRight: boolean;
  /** Nothing can make it happen: no path leads to it from the start of the page or from something the learner does. */
  unreachable: boolean;
  /**
   * The events that are shown in this node as well (see foldCompanions): a time mark that stops a video shows "Video läuft weiter"
   * with it, an Aufbau shows the Abbau that goes with it. Each is an event of its own with its own triggers - they only share the
   * place in the graph. Empty for nearly every node.
   */
  companions: GraphNodeModel[];
}

export interface GraphEdgeModel {
  id: string;
  from: string;
  to: string;
  kind: TimelineEdgeKind;
  delayMs: number;
  /** What it leads to has to hang below its source rather than stand to its right (see GraphNodeModel.outRight). */
  down: boolean;
  /** Two triggers between the same two nodes (their events are shown together, see foldCompanions) - drawn as a double line, which
   * says that here more happens than the line can tell. */
  doubled: boolean;
}

/**
 * What a required task (QuizBlock.required and the like) means for the page: "Nächste Folie" cannot be reached before it has been submitted.
 * Not a trigger - nothing here makes "Nächste Folie" happen, it only has to wait for it as well (a "and") - so it is no edge of the graph and
 * does not change where anything stands: drawn as a dotted violet line from the submission of the task to "Nächste Folie", ending in a lock.
 */
export interface GraphConditionModel {
  id: string;
  /** The event "submitted" of the required task, and the "Nächste Folie" that waits for it. */
  from: string;
  to: string;
  blockId: string;
}

export interface GraphModel {
  nodes: GraphNodeModel[];
  edges: GraphEdgeModel[];
  conditions: GraphConditionModel[];
  /** The node that shows an event: for an event that is shown in another one's node (a companion) that node's id. */
  shownIn: Map<string, string>;
}

/** Events that happen because the learner does something. */
function isUserEvent(node: TimelineNode): boolean {
  const type = node.eventType;
  return (
    type === "quiz-fill-start" ||
    type === "quiz-submit" ||
    type === "quiz-submit-correct" ||
    type === "quiz-submit-incorrect" ||
    type === "button-click" ||
    type === "revealer-button"
  );
}

/**
 * The members of a group whose Aufbau/Abbau is driven by the group (their only incoming trigger comes from the group's event, and
 * they trigger nothing themselves) are not shown: the group's event stands for them, drawn as one - the event block that takes the
 * complexity of "every member" off the graph. A member that is more than that stays visible.
 */
function collapseGroups(
  page: Page,
  nodes: TimelineNode[],
  edges: GraphEdgeModel[],
): { visible: TimelineNode[]; shown: GraphEdgeModel[] } {
  const hidden = new Set<string>();
  for (const group of page.groups) {
    for (const phase of ["entrance", "exit"] as const) {
      const effect = phase === "entrance" ? group.entranceEffect : group.exitEffect;
      if (!effect || effect.type === "off") continue;
      const groupNode = `group-${phase}:${group.id}`;
      for (const blockId of group.blockIds) {
        const member = `block-${phase}:${blockId}`;
        const into = edges.filter((e) => e.to === member);
        const out = edges.filter((e) => e.from === member);
        if (into.length === 1 && into[0].from === groupNode && out.length === 0) hidden.add(member);
      }
    }
  }
  return {
    visible: nodes.filter((n) => !hidden.has(n.id)),
    shown: edges.filter((e) => !hidden.has(e.from) && !hidden.has(e.to)),
  };
}

/**
 * Events that are shown together in one node (the author never groups anything: this follows from the triggers). A video that a
 * time mark has stopped goes on when the learner presses play: that event ("Video läuft weiter") is shown in the node of the time
 * mark, as long as the only thing it triggers is the Abbau of something that the same time mark makes appear - and that Abbau, which
 * nothing else triggers and which triggers nothing, is shown in the node of that Aufbau. Between the two nodes there are then two
 * triggers: a double line.
 *
 * As soon as something else is connected - "Video läuft weiter" triggers anything else, the Abbau is triggered by something else or
 * triggers something itself - the events get nodes of their own again.
 *
 * Returns companion event id -> the id of the event whose node shows it.
 */
function foldCompanions(page: Page, nodes: TimelineNode[]): Map<string, string> {
  const fold = new Map<string, string>();
  const ids = new Set(nodes.map((n) => n.id));
  const triggers = Object.values(page.timeline.triggers);
  for (const node of nodes) {
    if (node.eventType !== "video-resume") continue;
    const stopId = node.id.replace(/^video-resume:/, "video-stop:");
    if (!ids.has(stopId)) continue;
    const pairs: [string, string][] = [];
    let companion = true;
    for (const out of triggers.filter((t) => t.from === node.id)) {
      const exit = out.to;
      const block = /^block-exit:(.+)$/.exec(exit);
      const entrance = block ? `block-entrance:${block[1]}` : null;
      const onlyThis = triggers.filter((t) => t.to === exit).length === 1;
      const endsHere = !triggers.some((t) => t.from === exit);
      const sameMark = entrance !== null && triggers.some((t) => t.from === stopId && t.to === entrance);
      if (!entrance || !ids.has(entrance) || !ids.has(exit) || !onlyThis || !endsHere || !sameMark) {
        companion = false;
        break;
      }
      pairs.push([entrance, exit]);
    }
    if (!companion) continue;
    fold.set(node.id, stopId);
    for (const [entrance, exit] of pairs) fold.set(exit, entrance);
  }
  return fold;
}

/** The graph the editor shows for `page`: its events (see getPageLanes) as nodes and the triggers - the intrinsic ones of a block's
 * events and those of the page - as edges, each once. */
export function buildGraphModel(page: Page): GraphModel {
  const lanes = getPageLanes(page);
  let nodes = listAllNodes(page);
  const nodeIds = new Set(nodes.map((n) => n.id));

  let edges: GraphEdgeModel[] = [];
  const seen = new Set<string>();
  const addEdge = (from: string, to: string, kind: TimelineEdgeKind, delayMs: number) => {
    const key = `${from}>${to}`;
    if (!nodeIds.has(from) || !nodeIds.has(to) || seen.has(key)) return;
    seen.add(key);
    edges.push({ id: key, from, to, kind, delayMs, down: false, doubled: false });
  };
  for (const lane of lanes) {
    for (const edge of lane.edges) addEdge(edge.from, edge.to, edge.kind, edge.delayMs ?? 0);
    for (const node of lane.nodes) for (const child of node.children ?? []) addEdge(node.id, child.node.id, "timed", child.delayMs);
  }
  // Every trigger the page stores - an event can have several incoming ones, which the lanes only show one of.
  for (const id of Object.keys(page.timeline.triggers).sort()) {
    const trigger = page.timeline.triggers[id];
    addEdge(trigger.from, trigger.to, trigger.weiter ? "advance" : "timed", trigger.delayMs);
  }

  const incoming = new Set(edges.map((edge) => edge.to));

  // What a block itself makes happen - the learner filling in a quiz or clicking a button, a video the learner starts - can only
  // happen once the block is there, after its Aufbau. A line from the Aufbau to those events (no trigger: nothing is stored or
  // exported for it) puts them after it in the graph instead of beside the start of the page.
  const afterAppearing = new Set<string>();
  for (const block of orderedValues(page.blocks)) {
    if (block.entranceEffect.type === "off") continue;
    const entrance = blockEffectNodeId(block.id, "entrance");
    const own: string[] = [];
    if (block.kind === "quiz" || block.kind === "cloze" || block.kind === "checker" || block.kind === "solution" || block.kind === "matching" || block.kind === "sort") own.push(quizFillNodeId(block.id));
    else if (block.kind === "button") own.push(buttonClickNodeId(block.id));
    else if (isMediaBlock(block) && !incoming.has(videoStartNodeId(block.id))) own.push(videoStartNodeId(block.id));
    for (const id of own) {
      if (!nodeIds.has(entrance) || !nodeIds.has(id)) continue;
      addEdge(entrance, id, "unknown", 0);
      afterAppearing.add(id);
    }
  }

  const { visible, shown } = collapseGroups(page, nodes, edges);
  nodes = visible;
  edges = shown;
  const reachable = new Set<string>();
  const queue: string[] = [];
  const mark = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    queue.push(id);
  };
  for (const node of nodes) {
    // The start of the page, what the learner does, and a video the learner can always start.
    if (afterAppearing.has(node.id)) continue;
    if (node.kind === "start" || isUserEvent(node) || node.eventType === "video-start-manual" || node.eventType === "video-start-auto" || node.eventType === "revealer-open" || node.eventType === "variable-condition") mark(node.id);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of edges) if (edge.from === id) mark(edge.to);
  }

  const models: GraphNodeModel[] = nodes.map((node) => {
    const block = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;
    // Only the events the block itself makes (a quiz's, a video's) are drawn in its frame - not its Aufbau and Abbau.
    const inEventBlock =
      block &&
      (block.kind === "quiz" || block.kind === "cloze" || block.kind === "checker" || block.kind === "solution" || block.kind === "matching" || block.kind === "sort" || isMediaBlock(block)) &&
      node.eventType !== "block-entrance" &&
      node.eventType !== "block-exit";
    let color: EventColor = "blue";
    if (
      node.kind === "event" &&
      (node.eventType === "block-entrance" ||
        node.eventType === "block-exit" ||
        node.eventType?.startsWith("block-action") ||
        node.eventType === "group-entrance" ||
        node.eventType === "group-exit" ||
        node.eventType === "list-item-entrance")
    ) {
      color = "yellow";
    }
    // (A condition of a variable can come true from the start, and by itself: it needs no way in.)
    else if (node.eventType === "script-run" || node.eventType === "variable-condition") color = "green";
    else if (isUserEvent(node) || node.eventType === "video-resume") color = "violet";
    // A video start nothing triggers is the learner pressing play.
    else if (node.eventType?.startsWith("video-start") && !incoming.has(node.id)) color = "violet";
    return {
      id: node.id,
      node,
      color,
      blockId: inEventBlock ? block.id : undefined,
      blockKind: inEventBlock ? block.kind : undefined,
      outRight: node.eventType !== "video-stop-point" && node.eventType !== "video-resume",
      unreachable: !reachable.has(node.id),
      companions: [],
    };
  });

  // Events that share a node: the node of the first stands for both, and the triggers of the second start/end there.
  const fold = foldCompanions(page, nodes);
  const all = new Map(models.map((m) => [m.id, m]));
  const primaries = models.filter((m) => !fold.has(m.id));
  for (const [companion, primary] of fold) all.get(primary)!.companions.push(all.get(companion)!);

  const shownEdges: GraphEdgeModel[] = [];
  const byKey = new Map<string, GraphEdgeModel>();
  for (const edge of edges) {
    const from = fold.get(edge.from) ?? edge.from;
    const to = fold.get(edge.to) ?? edge.to;
    if (from === to) continue;
    const key = `${from}>${to}`;
    const have = byKey.get(key);
    if (have) {
      have.doubled = true;
      continue;
    }
    const merged = { ...edge, id: key, from, to };
    byKey.set(key, merged);
    shownEdges.push(merged);
  }

  // What a stop point triggers outside of its own video hangs below it; its own video goes on to the right.
  for (const edge of shownEdges) {
    const from = all.get(edge.from);
    const to = all.get(edge.to);
    if (from && to && !from.outRight && from.blockId !== to.blockId) edge.down = true;
  }

  // The required tasks of the page: "Nächste Folie" waits for each of them.
  const conditions: GraphConditionModel[] = [];
  const end = primaries.find((m) => m.id === "end");
  if (end) {
    const shown = new Set(primaries.map((m) => m.id));
    for (const block of orderedValues(page.blocks)) {
      if (!("required" in block) || !block.required) continue;
      const submitted = quizSubmitNodeId(block.id);
      if (shown.has(submitted)) conditions.push({ id: `required:${block.id}`, from: submitted, to: end.id, blockId: block.id });
    }
  }

  return { nodes: primaries, edges: shownEdges, conditions, shownIn: fold };
}
