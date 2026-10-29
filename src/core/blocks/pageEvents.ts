import { tr } from "../i18n/tr";
import type { GraphEventKind } from "../eventGraph/types";
import type { ActionEffect, TimelineEventType } from "../types";
import type { EventTypeLook } from "./types";

/**
 * How the editor shows the events that belong to the page, not to a kind of block: the Aufbau and the Abbau (every block and every group has them: the effects
 * are part of every block), the three Aktionseffekte of a block (move, shake, blink) and the condition of a variable that came true. They are named here, in the
 * same form as the `looks` of a descriptor's events. A trigger makes each of them happen (a condition has its own formula instead), so none has a hint.
 */
export const pageEventLooks: Partial<Record<TimelineEventType, EventTypeLook>> = {
  "block-entrance": { label: () => tr("ui.appears"), icon: "animation", color: "yellow" },
  "block-exit": { label: () => tr("ui.disappears"), icon: "dashing-away", color: "yellow" },
  "group-entrance": { label: () => tr("ui.group_appears"), icon: "animation", color: "yellow" },
  "group-exit": { label: () => tr("ui.group_disappears"), icon: "dashing-away", color: "yellow" },
  "block-action-move": { label: () => tr("ui.action_move_event"), icon: "action-move", color: "yellow" },
  "block-action-shake": { label: () => tr("ui.action_shake_event"), icon: "action-shake", color: "yellow" },
  "block-action-blink": { label: () => tr("ui.action_blink_event"), icon: "action-blink", color: "yellow" },
  "variable-condition": { label: () => tr("ui.condition_event_label"), icon: "condition", color: "green" },
};

/** Aufbau and Abbau: the two phases of the effects every block (`entranceEffect`, `exitEffect`) and every group has. */
export type EffectPhase = "entrance" | "exit";

/**
 * An event that every block or every group has, as the descriptors describe the events of a kind (OwnEventSpec): the id (`${idPrefix}:${id of the block or the
 * group}`), what it is in the graph the player runs (`graphKind`) and in the editor's timeline (`timelineType`), and the words of the node. A trigger can
 * make it happen. It is there as long as the effect is not "off" - and, for the Aufbau of a block, where nothing stands in for it (see `replacesEntrance`).
 * Kept in sync by hand with the player: it makes the ids of a block's (`blockEffectEventId`), not a group's (nothing happens for them there).
 */
export interface EffectEventSpec {
  idPrefix: string;
  graphKind: GraphEventKind;
  timelineType: TimelineEventType;
  /** The words of the node where the author gave none (`name`: what the block is called in the graph). Absent: the look of the type. */
  label?(name: string): string;
}

export const effectEventSpecs: Record<EffectPhase, { block: EffectEventSpec; group: EffectEventSpec }> = {
  entrance: {
    block: { idPrefix: "block-entrance", graphKind: "entrance", timelineType: "block-entrance", label: (name) => `${name} erscheint` },
    group: { idPrefix: "group-entrance", graphKind: "group-entrance", timelineType: "group-entrance" },
  },
  exit: {
    block: { idPrefix: "block-exit", graphKind: "exit", timelineType: "block-exit", label: (name) => `${name} verschwindet` },
    group: { idPrefix: "group-exit", graphKind: "group-exit", timelineType: "group-exit" },
  },
};

/**
 * The Aktionseffekte of a block (`actionEffects`: move, shake, blink): an event each (`${idPrefix}:${block}:${effect}`), only on a page - a layout block has none of
 * its own per page. What the timeline calls it depends on the effect (`timelineTypes`); the graph of the player has one kind for all (`graphKind`). A trigger
 * can make each happen; where in the chain it stands (between the Aufbau and the Abbau of its block) is for pageTimeline.ts. Kept in sync by hand with the
 * player (`blockActionEventId`).
 */
export const actionEventSpec = {
  idPrefix: "block-action",
  graphKind: "action" as GraphEventKind,
  timelineTypes: { move: "block-action-move", shake: "block-action-shake", blink: "block-action-blink" } as const satisfies Record<ActionEffect["type"], TimelineEventType>,
  /** The words of the node: what the block does (`name`: what it is called in the graph). */
  label(type: ActionEffect["type"], name: string): string {
    return tr(type === "move" ? "ui.action_moves" : type === "shake" ? "ui.action_shakes" : "ui.action_blinks", { n0: name });
  },
};

/**
 * The condition of an "Ausgelöst durch: Variable" (`PageTimeline.conditions`, by the id of the event it triggers): an event of its own that the player makes
 * happen when the formula turns true - a node to start from, like a button's click. The id is `${idPrefix}:${id of the event it triggers}`. Nothing triggers it
 * (its formula is what makes it happen), so it is no target of a trigger.
 */
export const conditionEventSpec = {
  idPrefix: "condition",
  graphKind: "condition" as GraphEventKind,
  timelineType: "variable-condition" as TimelineEventType,
  /** The words of the node: the formula, shortened. */
  label(formula: string): string {
    const text = formula.replace(/\s+/g, " ").trim();
    return tr("ui.condition_event", { n0: text.length > 28 ? `${text.slice(0, 27)}…` : text });
  },
};
