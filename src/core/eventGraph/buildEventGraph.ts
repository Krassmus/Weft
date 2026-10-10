import { orderedValues } from "../document/ordering";
import {
  blockEffectNodeId,
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  getEndTrigger,
  getVideoStartTrigger,
  quizEndNodeId,
  quizFillNodeId,
  quizSubmitNodeId,
  videoEndNodeId,
  videoStartNodeId,
  videoStopNodeId,
} from "../document/pageTimeline";
import type { ResolvedTrigger } from "../document/pageTimeline";
import type { Block, Layout, Page, Transition } from "../types";
import type { GraphEvent, GraphTrigger, PageGraph } from "./types";

/** The player's own id of the trigger leading to `to` (every event has at most one incoming trigger in the stored model so far). */
function triggerId(to: string): string {
  return `trigger:${to}`;
}

/**
 * The event graph of `page` (with the blocks of its `layout`) as the player runs it, built from what the page stores today:
 * block effects, a video's start, the quiz flags, "Nächste Folie" and the stored trigger edges. Every default that used to live
 * in the player (an Aufbau waiting for Weiter at the end of the queue, "Nächste Folie" after the last one, ...) is resolved here
 * into an explicit trigger - see docs/event-graph.md, section 8, for the table of what becomes what.
 */
export function buildEventGraph(page: Page, layout: Layout | null | undefined): PageGraph {
  const events: GraphEvent[] = [{ id: "start", kind: "start" }];
  const triggers: GraphTrigger[] = [];
  const transition: Transition = page.transition;

  const addTrigger = (to: string, resolved: ResolvedTrigger | null) => {
    if (!resolved) return;
    triggers.push({
      id: triggerId(to),
      from: resolved.from,
      to,
      delayMs: resolved.kind === "timed" ? resolved.delayMs : 0,
      weiter: resolved.kind === "advance",
    });
  };

  // The layout's blocks first, then the page's own: the same order the player puts them on the stage.
  const blocks: Block[] = [...orderedValues(layout?.blocks ?? {}), ...orderedValues(page.blocks)];
  for (const block of blocks) {
    if (block.entranceEffect.type !== "off") {
      const id = blockEffectNodeId(block.id, "entrance");
      events.push({ id, kind: "entrance" });
      addTrigger(id, getBlockEntranceTrigger(page, block));
    }
    if (block.exitEffect.type !== "off") {
      const id = blockEffectNodeId(block.id, "exit");
      events.push({ id, kind: "exit" });
      addTrigger(id, getBlockExitTrigger(page, block));
    }

    if (block.kind === "video") {
      const startId = videoStartNodeId(block.id);
      events.push({ id: startId, kind: "video-start" });
      addTrigger(startId, getVideoStartTrigger(page, block));
      for (const stopPoint of block.stopPoints) events.push({ id: videoStopNodeId(block.id, stopPoint.id), kind: "video-stop" });
      events.push({ id: videoEndNodeId(block.id), kind: "video-end" });
    }

    if (block.kind === "quiz") {
      events.push({ id: quizFillNodeId(block.id), kind: "quiz-fill" });
      // An open question has no wrong answer: whatever is submitted counts as right (see QuizBlock.open).
      const advanceOnIncorrect = block.advanceOnIncorrect && !block.open;
      const outcomes: { outcome: "richtig" | "falsch"; advance: boolean }[] = [
        { outcome: "richtig", advance: block.advanceOnCorrect },
        { outcome: "falsch", advance: advanceOnIncorrect },
      ];
      // The submit event of an outcome that goes on to the next page has its own id and its own "Nächste Folie"; with neither
      // going on there is the one plain "submitted" event (see buildQuizLane in document/pageTimeline.ts).
      if (!block.advanceOnCorrect && !advanceOnIncorrect) events.push({ id: quizSubmitNodeId(block.id), kind: "quiz-submit" });
      for (const { outcome, advance } of outcomes) {
        if (!advance) continue;
        const submitId = quizSubmitNodeId(block.id, outcome);
        const endId = quizEndNodeId(block.id, outcome);
        events.push({ id: submitId, kind: "quiz-submit" });
        events.push({ id: endId, kind: "end", transition });
        // Delayed, so the learner still gets to see the feedback before the page moves on.
        triggers.push({ id: triggerId(endId), from: submitId, to: endId, delayMs: 1500, weiter: false });
      }
    }
  }

  events.push({ id: "end", kind: "end", transition });
  addTrigger("end", getEndTrigger(page));

  return { events, triggers };
}
