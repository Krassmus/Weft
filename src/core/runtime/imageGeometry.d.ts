import type { ImageBlock, ImageMaskPoint } from "../types";

/** The outline of a mask worked out for a box of the given shape (see imageGeometry.js). Points are in "true space": the box is
 * 100 units wide and 100 / boxAspect high. */
export interface ImageMaskOutlineEntry {
  pre: { x: number; y: number };
  post: { x: number; y: number };
  arc: { x: number; y: number }[] | null;
  tangent: { x: number; y: number } | null;
  next: { x: number; y: number }[];
}

export function imageMaskOutline(points: ImageMaskPoint[], boxAspect: number): ImageMaskOutlineEntry[];

/** The mask as an SVG path in true space (see above). */
export function imageMaskPathD(points: ImageMaskPoint[], boxAspect: number): string;

/** The curve's middle on the stretch after each point, in the block's own percent. */
export function imageMaskSegmentMiddles(points: ImageMaskPoint[], boxAspect: number): { x: number; y: number }[];

/** How far the drawing of an effect reaches past the block's box, in units (the box is 100 units wide). */
export function imageEffectBleed(
  block: Pick<ImageBlock, "position" | "effect">,
  boxAspect: number,
): { l: number; r: number; t: number; b: number };

/** The picture of an image block with a mask and/or an effect as HTML (an SVG that fills the block's box). `uid` keeps the ids
 * inside unique when the same block is drawn twice. */
export function imageSvgMarkup(
  block: Pick<ImageBlock, "id" | "position" | "alt" | "mask" | "effect">,
  boxAspect: number,
  src: string,
  uid?: string,
): string;
