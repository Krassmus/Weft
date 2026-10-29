import { tr } from "../i18n/tr";
import type { TimelineEventType } from "../types";
import type { EventTypeLook } from "./types";

/**
 * How the editor shows the events that every block (and every group) can have, whatever its kind: the Aufbau and the Abbau. They belong to no descriptor - the
 * effects are part of every block (`entranceEffect`, `exitEffect`) - so they are named here, in the same form as the `looks` of a descriptor's events.
 * A trigger can make both happen, so neither has a hint.
 */
export const effectEventLooks: Partial<Record<TimelineEventType, EventTypeLook>> = {
  "block-entrance": { label: () => tr("ui.appears"), icon: "animation" },
  "block-exit": { label: () => tr("ui.disappears"), icon: "dashing-away" },
  "group-entrance": { label: () => tr("ui.group_appears"), icon: "animation" },
  "group-exit": { label: () => tr("ui.group_disappears"), icon: "dashing-away" },
};
