import { parseExpression } from "../document/expressions";
import { orderedValues } from "../document/ordering";
import { endNodeIds } from "../document/pageTimeline";
import type { Block, Layout, Page } from "../types";
import { actionEventsOf, effectEventsOf, groupEffectEventsOf, ownEventsOf } from "../blocks/registry";
import { actionEventSpec, conditionEventSpec } from "../blocks/pageEvents";
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
    // (Only a page has the events of its own that stand in for an Aufbau: a list whose items appear one by one has the items', a logic block its script
    // running - and there is none in a layout. What they are is the descriptor's: see OwnEventSpec.)
    const where = { onPage: pageBlockIds.has(block.id) };
    const own = ownEventsOf(block, where);
    for (const event of own) if (event.spec.replacesEntrance) events.push({ id: event.id, kind: event.spec.graphKind });
    // (The block's Aufbau and Abbau - none where its own events stand in for the Aufbau: see effectEventsOf. The Aktionseffekte lie between them.)
    const effects = effectEventsOf(block, where);
    for (const effect of effects) {
      if (effect.phase !== "entrance") continue;
      events.push({ id: effect.id, kind: effect.spec.graphKind });
      if (!pageBlockIds.has(block.id)) triggers.push({ id: `layout:${effect.id}`, from: "start", to: effect.id, delayMs: 0, weiter: false });
    }
    for (const action of actionEventsOf(block, where)) events.push({ id: action.id, kind: actionEventSpec.graphKind });
    for (const effect of effects) if (effect.phase === "exit") events.push({ id: effect.id, kind: effect.spec.graphKind });

    // The other events of its own: a revealer's opening and its button, a button's click, a video's start, its stop points (and the video going on after the
    // ones that stop it - the learner presses play again) and its end, the first answer to a task, its being submitted and being submitted right or wrong.
    for (const event of own) if (!event.spec.replacesEntrance) events.push({ id: event.id, kind: event.spec.graphKind });

    if (block.kind === "button" && !pageBlockIds.has(block.id) && block.action === "event") {
      // A button of the layout can't have a trigger of its own per page: what it does as an "event" button is to go on.
      const id = own[0].id;
      triggers.push({ id: `layout:${id}`, from: id, to: "end", delayMs: 0, weiter: false });
    }

  }

  for (const group of page.groups) {
    for (const effect of groupEffectEventsOf(group)) events.push({ id: effect.id, kind: effect.spec.graphKind });
  }

  for (const endId of endNodeIds(page)) events.push({ id: endId, kind: "end", transition: page.timeline.ends[endId].transition });

  // The conditions ("Ausgelöst durch: Variable"): an event each, which the player makes happen when the formula turns true.
  for (const [id, formula] of Object.entries(page.timeline.conditions ?? {})) {
    const parsed = parseExpression(formula);
    events.push({ id, kind: conditionEventSpec.graphKind, expr: parsed.ok ? parsed.expr : null });
  }

  // The titles the author gave the events (a script finds an event to trigger by its title).
  for (const event of events) {
    const title = page.timeline.titles?.[event.id]?.trim();
    if (title && !event.title) event.title = title;
  }

  const known = new Set(events.map((event) => event.id));
  for (const id of Object.keys(page.timeline.triggers).sort()) {
    const trigger = page.timeline.triggers[id];
    if (!known.has(trigger.from) || !known.has(trigger.to)) continue;
    triggers.push({ id, from: trigger.from, to: trigger.to, delayMs: trigger.delayMs, weiter: trigger.weiter });
  }

  return { events, triggers };
}
