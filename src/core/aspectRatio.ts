import type { AspectRatio } from "./types";

// The player (core/runtime/player.runtime.js, parseAspectRatio) reads the same "W:H" text by hand -
// that file ships with no bundler and can't import this one, so keep both in sync.

/** The ratios offered by name in the settings; any other "W:H" is a custom one. */
export const ASPECT_RATIO_PRESETS: { value: AspectRatio; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "9:16", label: "9:16 (Smartphone)" },
];

/** A custom ratio is kept between 1:10 and 10:1 - beyond that the slide is just a sliver nobody can
 * lay anything out on. */
export const MIN_ASPECT = 1 / 10;
export const MAX_ASPECT = 10;

const FALLBACK = { width: 16, height: 9 };

/** The two numbers of an "W:H" ratio (they need not be whole: "1.85:1"); 16:9 for anything unreadable. */
export function parseAspectRatio(ratio: AspectRatio): { width: number; height: number } {
  const [rawWidth, rawHeight] = ratio.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) ? { width, height } : FALLBACK;
}

export function isPresetAspectRatio(ratio: AspectRatio): boolean {
  return ASPECT_RATIO_PRESETS.some((preset) => preset.value === ratio);
}

/** Whether `width:height` is usable as a custom ratio - both positive numbers, and a ratio within
 * MIN_ASPECT..MAX_ASPECT. */
export function isValidAspect(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return false;
  const aspect = width / height;
  return aspect >= MIN_ASPECT && aspect <= MAX_ASPECT;
}

export function formatAspectRatio(width: number, height: number): AspectRatio {
  return `${width}:${height}`;
}

/** As a CSS `aspect-ratio` value. */
export function aspectRatioCss(ratio: AspectRatio): string {
  const { width, height } = parseAspectRatio(ratio);
  return `${width} / ${height}`;
}

/** As a number (width/height) - used to translate an image's own pixel aspect ratio into the
 * width%/height% a block needs so the image renders edge-to-edge, not letterboxed inside its own
 * selection box (see fitImageToAspect in core/document/actions.ts). */
export function aspectRatioNumeric(ratio: AspectRatio): number {
  const { width, height } = parseAspectRatio(ratio);
  return width / height;
}
