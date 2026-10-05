import type { Transition, TransitionDirection, TransitionType } from "../types";

/** The order the transition <select> lists them in (TransitionPanel.tsx). */
export const TRANSITION_TYPES: TransitionType[] = ["none", "fade", "move", "iris", "cube", "blur", "horror"];

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  none: "Keine Animation",
  fade: "Fade",
  move: "Move",
  iris: "Iris-Blende",
  cube: "Würfel",
  blur: "Blur / Dissolve",
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
  horror: 2000,
};

export const DIRECTION_LABELS: Record<TransitionDirection, string> = {
  left: "Nach links",
  right: "Nach rechts",
  up: "Nach oben",
  down: "Nach unten",
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
