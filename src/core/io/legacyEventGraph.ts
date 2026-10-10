import { orderedValues } from "../document/ordering";
import type { Block, PageEnd, PageTimeline, PageTrigger, QuizBlock, Transition, VideoBlock } from "../types";

/**
 * What the event graph of a page was stored as up to format version 3 (see CURRENT_FORMAT_VERSION in core/types.ts), and how that is
 * turned into today's (PageTimeline: explicit triggers and "Nächste Folie" events) when such a file is opened. Only the migration
 * (io/unpack.ts) uses this - it is a frozen copy of the resolution rules the editor and the player followed back then, including all
 * the implicit defaults ("an Aufbau waits for Weiter at the end of the queue", "Nächste Folie after the last one", a quiz that goes
 * on by a flag, a video that autoplays), which are written out as triggers here once.
 */

/** A trigger as format 3 stored it: by the event it causes, at most one per event. */
export interface LegacyTriggerEdge {
  from: string;
  kind: "unknown" | "timed" | "advance";
  delayMs?: number;
}

export interface LegacyPage {
  blocks: Record<string, Block>;
  transition?: Transition;
  timeline?: { triggerEdges?: Record<string, LegacyTriggerEdge> };
}

type Resolved = { kind: "timed"; from: string; delayMs: number } | { kind: "advance"; from: string };

// The ids of events - the same strings as today (document/pageTimeline.ts).
const entranceId = (blockId: string) => `block-entrance:${blockId}`;
const exitId = (blockId: string) => `block-exit:${blockId}`;
const videoStartId = (blockId: string) => `video-start:${blockId}`;
const quizSubmitId = (blockId: string, outcome: "richtig" | "falsch") => `quiz-submit:${blockId}:${outcome}`;
const quizEndId = (blockId: string, outcome: "richtig" | "falsch") => `end:quiz:${blockId}:${outcome}`;

class LegacyResolver {
  private edges: Record<string, LegacyTriggerEdge>;

  constructor(private page: LegacyPage) {
    this.edges = page.timeline?.triggerEdges ?? {};
  }

  private blocks(): Block[] {
    return orderedValues(this.page.blocks as Record<string, Block & { order: string }>);
  }

  private resolved(edge: LegacyTriggerEdge): Resolved {
    return edge.kind === "advance" ? { kind: "advance", from: edge.from } : { kind: "timed", from: edge.from, delayMs: edge.delayMs ?? 0 };
  }

  private explicitTail(exclude: string | null): string {
    const advance = Object.entries(this.edges)
      .filter(([to, e]) => e.kind === "advance" && to !== exclude)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([to, e]) => ({ ...e, to }));
    const froms = new Set(advance.map((e) => e.from));
    for (const edge of advance) if (!froms.has(edge.to)) return edge.to;
    return "start";
  }

  private waitsOn(start: string, target: string, implicit: Map<string, string>): boolean {
    const seen = new Set<string>();
    let id: string | undefined = start;
    while (id !== undefined && !seen.has(id)) {
      if (id === target) return true;
      seen.add(id);
      id = this.edges[id]?.from ?? implicit.get(id);
    }
    return false;
  }

  private walkQueue(exclude: string | null): { entranceFrom: Map<string, string>; tail: string } {
    let tail = this.explicitTail(exclude);
    const entranceFrom = new Map<string, string>();
    const implicit = new Map<string, string>();
    for (const block of this.blocks()) {
      if (block.entranceEffect.type === "off") continue;
      const nodeId = entranceId(block.id);
      if (nodeId === exclude || this.edges[nodeId]) continue;
      if (this.waitsOn(tail, nodeId, implicit)) {
        entranceFrom.set(block.id, "start");
        implicit.set(nodeId, "start");
      } else {
        entranceFrom.set(block.id, tail);
        implicit.set(nodeId, tail);
        tail = nodeId;
      }
    }
    return { entranceFrom, tail };
  }

  private chainTail(exclude: string | null): string {
    const { entranceFrom, tail } = this.walkQueue(exclude);
    if (exclude === null) return tail;
    const implicit = new Map<string, string>();
    for (const [blockId, from] of entranceFrom) implicit.set(entranceId(blockId), from);
    return this.waitsOn(tail, exclude, implicit) ? "start" : tail;
  }

  entrance(block: Block): Resolved | null {
    if (block.entranceEffect.type === "off") return null;
    const edge = this.edges[entranceId(block.id)];
    if (edge) return this.resolved(edge);
    return { kind: "advance", from: this.walkQueue(null).entranceFrom.get(block.id) ?? "start" };
  }

  exit(block: Block): Resolved | null {
    if (block.exitEffect.type === "off") return null;
    const edge = this.edges[exitId(block.id)];
    if (edge) return this.resolved(edge);
    return { kind: "advance", from: this.chainTail(exitId(block.id)) };
  }

  videoStart(video: VideoBlock): Resolved | null {
    const edge = this.edges[videoStartId(video.id)];
    if (edge) return this.resolved(edge);
    return video.autoplay ? { kind: "timed", from: "start", delayMs: 0 } : null;
  }

  end(): Resolved | null {
    const edge = this.edges["end"];
    if (!edge) return { kind: "advance", from: this.chainTail("end") };
    return edge.kind === "advance" ? { kind: "advance", from: edge.from } : null;
  }
}

/**
 * The format-3 graph of `page` as today's PageTimeline. Every trigger the page effectively had - stored or implied - becomes a
 * stored one: the Weiter queue as explicit links, "Nächste Folie" after the end of it (or none, for "Gar nicht"), the quiz flags as
 * triggers to events of their own, an autoplaying video as a trigger from the start. The page's transition is the one of every
 * "Nächste Folie" it has.
 */
export function legacyPageToTimeline(page: LegacyPage): PageTimeline {
  const resolver = new LegacyResolver(page);
  const triggers: Record<string, PageTrigger> = {};
  const ends: Record<string, PageEnd> = {};
  const transition: Transition = page.transition ?? { type: "none", durationMs: 500 };

  const add = (to: string, resolved: Resolved | null) => {
    if (!resolved) return;
    triggers[`t:${to}`] = {
      from: resolved.from,
      to,
      delayMs: resolved.kind === "timed" ? resolved.delayMs : 0,
      weiter: resolved.kind === "advance",
    };
  };

  for (const block of orderedValues(page.blocks as Record<string, Block & { order: string }>)) {
    add(entranceId(block.id), resolver.entrance(block));
    add(exitId(block.id), resolver.exit(block));
    if (block.kind === "video") add(videoStartId(block.id), resolver.videoStart(block));
    if (block.kind === "quiz") {
      const quiz = block as QuizBlock & { advanceOnCorrect?: boolean; advanceOnIncorrect?: boolean };
      const flags: ["richtig" | "falsch", boolean | undefined][] = [
        ["richtig", quiz.advanceOnCorrect],
        // An open question has no wrong answer (see QuizBlock.open).
        ["falsch", quiz.advanceOnIncorrect && !quiz.open],
      ];
      for (const [outcome, on] of flags) {
        if (!on) continue;
        const endId = quizEndId(block.id, outcome);
        ends[endId] = { transition: structuredClone(transition) };
        // Delayed, so the learner still gets to see the feedback before the page moves on.
        triggers[`t:${endId}`] = { from: quizSubmitId(block.id, outcome), to: endId, delayMs: 1500, weiter: false };
      }
    }
  }

  ends["end"] = { transition: structuredClone(transition) };
  add("end", resolver.end());

  return { triggers, ends };
}
