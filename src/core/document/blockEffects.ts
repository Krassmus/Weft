import type { BlockEffect } from "../types";

/** Every block gets this by default - instant and immediate, i.e. exactly how a block behaved
 * before entrance/exit effects existed at all (see BaseBlock.entranceEffect in core/types.ts).
 * With no explicit PageTimeline.triggerEdges entry for it either (see getBlockEntranceTrigger in
 * document/pageTimeline.ts), this is a block's whole entrance, start to finish. */
export function defaultEntranceEffect(): BlockEffect {
  return { type: "none", durationMs: 500 };
}

/** Every block gets this by default - never fires, i.e. the block simply stays until the slide
 * itself changes (see BaseBlock.exitEffect in core/types.ts, and getBlockExitTrigger in
 * document/pageTimeline.ts for how "never" is represented: no triggerEdges entry at all). */
export function defaultExitEffect(): BlockEffect {
  return { type: "none", durationMs: 500 };
}
