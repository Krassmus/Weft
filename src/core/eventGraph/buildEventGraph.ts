import { orderedValues } from "../document/ordering";
import {
  blockEffectNodeId,
  endNodeIds,
  quizFillNodeId,
  quizSubmitNodeId,
  videoEndNodeId,
  videoStartNodeId,
  videoStopNodeId,
} from "../document/pageTimeline";
import type { Block, Layout, Page } from "../types";
import type { GraphEvent, GraphTrigger, PageGraph } from "./types";

/**
 * The event graph of `page` (with the blocks of its `layout`) as the player runs it (see types.ts): the events the blocks give the
 * page, the "Nächste Folie" events the page stores, and the page's triggers. Nothing is resolved here any more - every trigger
 * the page has is stored (see PageTimeline in core/types.ts); the one thing added is what a layout block does: its Aufbau/Abbau can't
 * have a trigger of its own per page (it is the layout's), so an Aufbau happens at the start of the page.
 */
export function buildEventGraph(page: Page, layout: Layout | null | undefined): PageGraph {
  const events: GraphEvent[] = [{ id: "start", kind: "start" }];
  const triggers: GraphTrigger[] = [];

  // The layout's blocks first, then the page's own: the same order the player puts them on the stage.
  const pageBlockIds = new Set(Object.keys(page.blocks));
  const blocks: Block[] = [...orderedValues(layout?.blocks ?? {}), ...orderedValues(page.blocks)];
  for (const block of blocks) {
    if (block.entranceEffect.type !== "off") {
      const id = blockEffectNodeId(block.id, "entrance");
      events.push({ id, kind: "entrance" });
      if (!pageBlockIds.has(block.id)) triggers.push({ id: `layout:${id}`, from: "start", to: id, delayMs: 0, weiter: false });
    }
    if (block.exitEffect.type !== "off") events.push({ id: blockEffectNodeId(block.id, "exit"), kind: "exit" });

    if (block.kind === "video") {
      events.push({ id: videoStartNodeId(block.id), kind: "video-start" });
      for (const stopPoint of block.stopPoints) events.push({ id: videoStopNodeId(block.id, stopPoint.id), kind: "video-stop" });
      events.push({ id: videoEndNodeId(block.id), kind: "video-end" });
    }

    if (block.kind === "quiz") {
      events.push({ id: quizFillNodeId(block.id), kind: "quiz-fill" });
      // The player lets the plain "submitted" event happen, and the one of the outcome as well.
      events.push({ id: quizSubmitNodeId(block.id), kind: "quiz-submit" });
      events.push({ id: quizSubmitNodeId(block.id, "richtig"), kind: "quiz-submit" });
      events.push({ id: quizSubmitNodeId(block.id, "falsch"), kind: "quiz-submit" });
    }
  }

  for (const endId of endNodeIds(page)) events.push({ id: endId, kind: "end", transition: page.timeline.ends[endId].transition });

  const known = new Set(events.map((event) => event.id));
  for (const id of Object.keys(page.timeline.triggers).sort()) {
    const trigger = page.timeline.triggers[id];
    if (!known.has(trigger.from) || !known.has(trigger.to)) continue;
    triggers.push({ id, from: trigger.from, to: trigger.to, delayMs: trigger.delayMs, weiter: trigger.weiter });
  }

  return { events, triggers };
}
