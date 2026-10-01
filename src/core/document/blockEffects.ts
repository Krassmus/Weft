import type { BlockEffect } from "../types";

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
