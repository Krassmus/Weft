/**
 * The layout of an event graph (see docs/event-graph.md, section 6): which column and row every event sits in. Columns follow time
 * (the longest chain of triggers that leads to an event), rows follow branching. Pure - no DOM, no document - so that it can be
 * reasoned about on its own; Timeline.tsx turns the result into pixels and lines.
 *
 * Rules:
 * - An outgoing trigger goes to the right. The first thing a trigger leads to stays in the row of its source; every further one
 *   starts a row of its own below. A trigger marked `down` (what a stop point of a video triggers, which hangs below it) is placed
 *   in its source's column, below it.
 * - Incoming triggers come from the left or from above. What would break that - a trigger that leads back in time (a loop), or one
 *   that comes in from below - is a "detour": drawn as a faint line behind everything else (see `LayoutEdge.route`).
 * - "Nächste Folie" events (`isEnd`) stand in the last column.
 */

export interface LayoutNodeInput {
  id: string;
  /** A "Nächste Folie" event: stands in the last column. */
  isEnd: boolean;
}

export interface LayoutEdgeInput {
  id: string;
  from: string;
  to: string;
  /** The event this goes to may not stand to the right of its source: it goes below it, in the same column. */
  down?: boolean;
}

/** How a trigger is drawn: `straight` - same row, to the right; `down` - leaves to the right and turns down into a row below
 * (incoming from the left); `vertical` - straight down in the same column (a node that doesn't let triggers go right); `detour` -
 * everything that would come in from below or from the right: a faint line around the graph. */
export type EdgeRoute = "straight" | "down" | "vertical" | "detour";

export interface LayoutEdge extends LayoutEdgeInput {
  route: EdgeRoute;
}

export interface GraphLayout {
  col: Map<string, number>;
  row: Map<string, number>;
  /** Number of columns / rows used. */
  cols: number;
  rows: number;
  edges: LayoutEdge[];
}

export function layoutGraph(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): GraphLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const valid = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to) && edge.from !== edge.to);
  const outgoing = new Map<string, LayoutEdgeInput[]>();
  const incomingCount = new Map<string, number>();
  for (const edge of valid) {
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }
  for (const list of outgoing.values()) list.sort((a, b) => (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0));

  // Where a walk begins: the start of the page, then everything nothing leads to (the events of the learner, a manual video start).
  const roots = nodes
    .filter((node) => !incomingCount.has(node.id))
    .sort((a, b) => (a.id === "start" ? -1 : b.id === "start" ? 1 : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
  // A loop with no root of its own is still shown: its first node starts the walk.
  const walkStarts = [...roots, ...nodes];

  // 1. Find the edges that close a loop (they go "back in time").
  const back = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 1: on the current path, 2: done
  const finished: string[] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const edge of outgoing.get(id) ?? []) {
      const s = state.get(edge.to) ?? 0;
      if (s === 1) back.add(edge.id);
      else if (s === 0) visit(edge.to);
    }
    state.set(id, 2);
    finished.push(id);
  };
  for (const start of walkStarts) if (!state.has(start.id)) visit(start.id);

  // 2. Columns: the longest way to a node along the other edges (a node that doesn't let triggers go right adds nothing).
  const col = new Map<string, number>();
  const forward = valid.filter((edge) => !back.has(edge.id));
  for (const id of [...finished].reverse()) {
    let c = 0;
    for (const edge of forward) {
      if (edge.to !== id) continue;
      c = Math.max(c, (col.get(edge.from) ?? 0) + (edge.down ? 0 : 1));
    }
    col.set(id, c);
  }
  const lastNonEnd = Math.max(0, ...nodes.filter((node) => !node.isEnd).map((node) => col.get(node.id) ?? 0));
  for (const node of nodes) if (node.isEnd) col.set(node.id, Math.max(col.get(node.id) ?? 0, lastNonEnd + 1));

  // 3. Rows: depth first, in the order of the nodes. The first thing a node triggers goes on in its row, the others get one each below.
  const row = new Map<string, number>();
  const taken = new Set<string>();
  let nextRow = 0;
  const place = (id: string, wanted: number) => {
    if (row.has(id)) return;
    let r = wanted;
    const c = col.get(id) ?? 0;
    while (taken.has(`${c}:${r}`)) r++;
    row.set(id, r);
    taken.add(`${c}:${r}`);
    nextRow = Math.max(nextRow, r + 1);
    // What goes on to the right first (it keeps the row), then what hangs below, then the rest in rows of their own.
    const children = (outgoing.get(id) ?? []).filter((edge) => !back.has(edge.id) && !row.has(edge.to));
    let first = true;
    for (const edge of children.filter((e) => !e.down)) {
      place(edge.to, first ? r : nextRow);
      first = false;
    }
    for (const edge of children.filter((e) => e.down)) place(edge.to, r + 1);
  };
  for (const start of walkStarts) if (!row.has(start.id)) place(start.id, nextRow);

  // 4. How every trigger is drawn.
  const laidOut: LayoutEdge[] = valid.map((edge) => {
    const cu = col.get(edge.from)!;
    const cv = col.get(edge.to)!;
    const ru = row.get(edge.from)!;
    const rv = row.get(edge.to)!;
    let route: EdgeRoute;
    if (back.has(edge.id) || cv < cu || rv < ru) route = "detour";
    else if (cv === cu) route = rv > ru ? "vertical" : "detour";
    else route = rv === ru ? "straight" : "down";
    return { ...edge, route };
  });

  return {
    col,
    row,
    cols: Math.max(0, ...col.values()) + 1,
    rows: Math.max(0, ...row.values()) + 1,
    edges: laidOut,
  };
}
