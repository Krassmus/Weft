import type { ArrowBlock } from "../../types";

export type ArrowRenderBlock = Pick<ArrowBlock, "id" | "position" | "points" | "arrowStyle" | "color" | "width" | "startHead" | "endHead">;

/** What the block says: the arrow and the block's real width : height on the slide. */
export interface ArrowRenderProps {
  block: ArrowRenderBlock;
  boxAspect: number;
}

/** What the place it is drawn in provides. */
export interface ArrowRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
}

/** Draws the arrow into `root`; `update` draws it again. */
export function renderArrow(root: HTMLElement, props: ArrowRenderProps, ctx?: ArrowRenderContext): { update(props: ArrowRenderProps): void; destroy(): void };

/** The SVG of an arrow. `boxAspect` is the block's real width : height on the slide. */
export function arrowSvgMarkup(block: ArrowRenderBlock, boxAspect: number): string;

/** The curve's middle between each pair of neighbouring waypoints, in the block's own percent. */
export function arrowSegmentMiddles(block: Pick<ArrowBlock, "position" | "points">, boxAspect: number): { x: number; y: number }[];

/** `count` + 1 points along the curve through `points`, evenly spaced along its length. */
export function arrowEvenPoints(points: { x: number; y: number }[], count: number): { x: number; y: number }[];

/** The middle of the curve between each pair of neighbouring points, in the points' units. */
export function arrowCurveMiddles(points: { x: number; y: number }[]): { x: number; y: number }[];
