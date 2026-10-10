import type { PageTimeline } from "../types";

/**
 * A linear chain of events (docs/event-graph.md, section 7): events - animations, an Aufbau after an Aufbau - that follow each other
 * one by one, each caused by the one before it and by nothing else. Their order can be changed by moving one of them: the
 * properties of the links (delay, waits for Weiter) stay where they are, the events move - the rhythm stays, the sequence changes.
 */
export interface Chain {
  /** What causes the first event of the chain. */
  sourceId: string;
  /** The events, in the order they happen. */
  nodeIds: string[];
  /** The links: `triggerIds[i]` leads into `nodeIds[i]`; if the last event has exactly one trigger of its own, it is the
   * last element (leading on from the chain). */
  triggerIds: string[];
}

interface Linked {
  id: string;
  from: string;
  to: string;
}

/**
 * The chain `nodeId` is part of, or null if it is not part of one of at least two events. `movable` says which events may be part
 * of a chain (the ones that are animations of blocks). An event belongs to a chain if exactly one trigger leads to it and the
 * event before it has exactly one trigger to a movable event that has no other cause.
 */
export function findChain(timeline: PageTimeline, nodeId: string, movable: (id: string) => boolean): Chain | null {
  const triggers: Linked[] = Object.entries(timeline.triggers).map(([id, t]) => ({ id, from: t.from, to: t.to }));
  const incoming = (id: string) => triggers.filter((t) => t.to === id);
  const outgoing = (id: string) => triggers.filter((t) => t.from === id);
  if (!movable(nodeId) || incoming(nodeId).length !== 1) return null;

  // The one movable event this one leads to - and only if that one has no other cause.
  const next = (id: string): Linked | null => {
    const candidates = outgoing(id).filter((t) => movable(t.to) && t.to !== id && incoming(t.to).length === 1);
    return candidates.length === 1 ? candidates[0] : null;
  };
  const previous = (id: string): Linked | null => {
    const trigger = incoming(id)[0];
    if (!trigger || !movable(trigger.from) || incoming(trigger.from).length !== 1) return null;
    return next(trigger.from)?.to === id ? trigger : null;
  };

  // Back to the beginning ...
  const seen = new Set<string>([nodeId]);
  let first = nodeId;
  for (;;) {
    const p = previous(first);
    if (!p || seen.has(p.from)) break;
    first = p.from;
    seen.add(first);
  }
  // ... and on to the end.
  const nodeIds = [first];
  const triggerIds = [incoming(first)[0].id];
  for (;;) {
    const n = next(nodeIds[nodeIds.length - 1]);
    if (!n || nodeIds.includes(n.to)) break;
    nodeIds.push(n.to);
    triggerIds.push(n.id);
  }
  if (nodeIds.length < 2) return null;

  // What the last event leads on to, if that is exactly one thing outside of the chain.
  const lastOut = outgoing(nodeIds[nodeIds.length - 1]);
  if (lastOut.length === 1 && !nodeIds.includes(lastOut[0].to)) triggerIds.push(lastOut[0].id);

  return { sourceId: incoming(first)[0].from, nodeIds, triggerIds };
}

/**
 * The new `from`/`to` of the links of `chain` once its events stand in `order` (a permutation of `chain.nodeIds`): the link at a
 * position keeps its properties, the events move. Returns the endpoints per trigger id.
 */
export function reorderedLinks(chain: Chain, order: string[], lastTarget: string | null): Map<string, { from: string; to: string }> {
  const links = new Map<string, { from: string; to: string }>();
  chain.triggerIds.forEach((id, i) => {
    if (i < order.length) links.set(id, { from: i === 0 ? chain.sourceId : order[i - 1], to: order[i] });
    else if (lastTarget !== null) links.set(id, { from: order[order.length - 1], to: lastTarget });
  });
  return links;
}
