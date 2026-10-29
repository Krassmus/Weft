import { tr } from "../i18n/tr";
import type { TimelineEventType } from "../types";
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
