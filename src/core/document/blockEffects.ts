import type { ActionEffect, ActionEffectType, BlockEffect } from "../types";

/** Every block gets this by default - "off" (see BlockEffectType's own doc comment in
 * core/types.ts): no Aufbau at all, i.e. exactly how a block behaved before entrance/exit effects
 * existed - just there from the moment the slide is, never wired to any trigger, never shown in
 * the page's own event graph. */
export function defaultEntranceEffect(): BlockEffect {
  return { type: "off", durationMs: 500 };
}

/** Every block gets this by default - "off": no Abbau at all, i.e. the block simply stays until
 * the slide itself changes (see BaseBlock.exitEffect in core/types.ts). */
export function defaultExitEffect(): BlockEffect {
  return { type: "off", durationMs: 500 };
}

/** A new Aktionseffekt of the given type (see ActionEffect): a move goes a little way to the right, a shake and a blink are one go. */
export function defaultActionEffect(id: string, type: ActionEffectType): ActionEffect {
  if (type === "move") return { id, type, durationMs: 800, path: [{ x: 15, y: 0 }], easing: "ease-in-out", rotation: 0 };
  return { id, type, durationMs: type === "shake" ? 600 : 800 };
}
