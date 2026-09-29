import type { BlockEffect } from "../types";

/** Every block gets this by default - instant and immediate, i.e. exactly how a block behaved
 * before entrance/exit effects existed at all (see BaseBlock.entranceEffect in core/types.ts). */
export function defaultEntranceEffect(): BlockEffect {
  return { type: "none", durationMs: 500, triggerEventId: "start", delayMs: 0 };
}

/** Every block gets this by default - never fires, i.e. the block simply stays until the slide
 * itself changes (see BaseBlock.exitEffect in core/types.ts). */
export function defaultExitEffect(): BlockEffect {
  return { type: "none", durationMs: 500, triggerEventId: null, delayMs: 0 };
}
