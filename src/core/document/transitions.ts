import type { Transition, TransitionDirection, TransitionType } from "../types";
import { tr } from "../i18n/tr";

/** The order the transition <select> lists them in (TransitionPanel.tsx). */
export const TRANSITION_TYPES: TransitionType[] = ["none", "fade", "move", "iris", "cube", "blur", "wheel", "horror"];

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  get none() { return tr("ui.no_animation"); },
  get fade() { return tr("ui.fade"); },
  get move() { return tr("ui.move"); },
  iris: "Iris-Blende",
  get cube() { return tr("ui.cube"); },
  get blur() { return tr("ui.blur_dissolve"); },
  wheel: "Wheel",
  horror: "Horror",
};

/** Each animation's own natural length - what a freshly chosen type starts at (see
 * setPageTransition), unless the author had already changed the duration themselves. Horror in
 * particular needs room for its four flicker cycles. Mirrored by player.runtime.js's fallback. */
export const DEFAULT_TRANSITION_DURATION_MS: Record<TransitionType, number> = {
  none: 500,
  fade: 500,
  move: 500,
  iris: 900,
  cube: 900,
  blur: 1200,
  wheel: 1600,
  horror: 2000,
};

export const DIRECTION_LABELS: Record<TransitionDirection, string> = {
  get left() { return tr("ui.to_the_left"); },
  get right() { return tr("ui.to_the_right"); },
  get up() { return tr("ui.up"); },
  get down() { return tr("ui.down"); },
};

/** Where a Move or Cube goes when no direction was picked: a Move slides the old slide off to the
 * left (what it always did), the cube turns to the right. Mirrored by player.runtime.js. */
export function defaultDirection(type: TransitionType): TransitionDirection {
  return type === "cube" ? "right" : "left";
}

export const DEFAULT_IRIS_CENTER = { x: 50, y: 50 };

export function transitionDirection(transition: Transition): TransitionDirection {
  return transition.direction ?? defaultDirection(transition.type);
}
