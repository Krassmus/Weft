import type { ArrowBlock } from "../types";

/** The SVG of an arrow (see arrowGeometry.js). `boxAspect` is the block's real width : height on the slide. */
export function arrowSvgMarkup(block: Pick<ArrowBlock, "id" | "position" | "points" | "arrowStyle" | "color" | "width" | "startHead" | "endHead">, boxAspect: number): string;

/** The curve's middle between each pair of neighbouring waypoints, in the block's own percent. */
export function arrowSegmentMiddles(block: Pick<ArrowBlock, "position" | "points">, boxAspect: number): { x: number; y: number }[];
