import { getPageLanes, listAllNodes } from "../../../core/document/pageTimeline";
import type { Block, Page, TimelineEdgeKind, TimelineNode } from "../../../core/types";

/** What kind an event is, which is what its colour says (docs/event-graph.md, section 2): the learner doing something (violet), an
 * animation (yellow), or anything else (blue). */
export type EventColor = "blue" | "yellow" | "violet";

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
}

export interface GraphEdgeModel {
  id: string;
  from: string;
  to: string;
  kind: TimelineEdgeKind;
  delayMs: number;
  /** What it leads to has to hang below its source rather than stand to its right (see GraphNodeModel.outRight). */
  down: boolean;
}

export interface GraphModel {
  nodes: GraphNodeModel[];
  edges: GraphEdgeModel[];
}

/** Events that happen because the learner does something. */
function isUserEvent(node: TimelineNode): boolean {
  const type = node.eventType;
  return type === "quiz-fill-start" || type === "quiz-submit" || type === "quiz-submit-correct" || type === "quiz-submit-incorrect";
}

/** The graph the editor shows for `page`: its events (see getPageLanes) as nodes and the triggers - the intrinsic ones of a block's
 * events and those of the page - as edges, each once. */
export function buildGraphModel(page: Page): GraphModel {
  const lanes = getPageLanes(page);
  const nodes = listAllNodes(page);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdgeModel[] = [];
  const seen = new Set<string>();
  const addEdge = (from: string, to: string, kind: TimelineEdgeKind, delayMs: number) => {
    const key = `${from}>${to}`;
    if (seen.has(key) || !nodeIds.has(from) || !nodeIds.has(to)) return;
    seen.add(key);
    edges.push({ id: key, from, to, kind, delayMs, down: false });
  };
  for (const lane of lanes) {
    for (const edge of lane.edges) addEdge(edge.from, edge.to, edge.kind, edge.delayMs ?? 0);
    for (const node of lane.nodes) for (const child of node.children ?? []) addEdge(node.id, child.node.id, "timed", child.delayMs);
  }

  const incoming = new Set(edges.map((edge) => edge.to));
  const reachable = new Set<string>();
  const queue: string[] = [];
  const mark = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    queue.push(id);
  };
  const hasNextButton = Object.values(page.blocks).some((b) => b.kind === "button" && (b.action === "next" || b.action === "advance"));
  for (const node of nodes) {
    // The start of the page, what the learner does, and a video the learner can always start.
    if (node.kind === "start" || isUserEvent(node) || node.eventType === "video-start-manual" || node.eventType === "video-start-auto") mark(node.id);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of edges) if (edge.from === id) mark(edge.to);
  }

  const models: GraphNodeModel[] = nodes.map((node) => {
    const block = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;
    const inEventBlock = block && (block.kind === "quiz" || block.kind === "video");
    let color: EventColor = "blue";
    if (node.kind === "event" && (node.eventType === "block-entrance" || node.eventType === "block-exit")) color = "yellow";
    else if (isUserEvent(node)) color = "violet";
    // A video start nothing triggers is the learner pressing play.
    else if (node.eventType?.startsWith("video-start") && !incoming.has(node.id)) color = "violet";
    return {
      id: node.id,
      node,
      color,
      blockId: inEventBlock ? block.id : undefined,
      blockKind: inEventBlock ? block.kind : undefined,
      outRight: node.eventType !== "video-stop-point",
      // "Nächste Folie" that a button leads to is reachable too: buttons are not events of the graph (yet).
      unreachable: !reachable.has(node.id) && !(node.kind === "end" && node.id === "end" && hasNextButton),
    };
  });

  // What a stop point triggers outside of its own video hangs below it; its own video goes on to the right.
  const byId = new Map(models.map((m) => [m.id, m]));
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from && to && !from.outRight && from.blockId !== to.blockId) edge.down = true;
  }

  return { nodes: models, edges };
}
