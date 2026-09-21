import type { AspectRatio } from "./types";

// Mirrored by hand in core/runtime/player.runtime.js (ASPECT_MAP) - that file ships with no
// bundler and can't import this one, so keep both in sync if this changes.
export const ASPECT_RATIO_CSS: Record<AspectRatio, string> = {
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
  "3:2": "3 / 2",
};

export const ASPECT_RATIOS: AspectRatio[] = ["16:9", "4:3", "1:1", "3:2"];

/** Same ratios as numbers (width/height) - used to translate an image's own pixel aspect ratio
 * into the width%/height% a block needs so the image renders edge-to-edge, not letterboxed
 * inside its own selection box (see fitImageToAspect in core/document/actions.ts). */
export const ASPECT_RATIO_NUMERIC: Record<AspectRatio, number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:2": 3 / 2,
};
