import type { ShapeBlock } from "../../types";

export type ShapeRenderBlock = Pick<ShapeBlock, "id" | "shapeKind" | "cornerRadii" | "sides" | "starPoints" | "starInnerRadius" | "fill" | "stroke" | "shadow"> & { position: { width: number; height: number } };

/** What the block says: the shape and the slide's width : height. */
export interface ShapeRenderProps {
  block: ShapeRenderBlock;
  slideAspect: number;
}

/** What the place it is drawn in provides. */
export interface ShapeRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  /** Where the picture is drawn on its own (the PDF): lengths are written in px, this many per cqw, and the shadow is an SVG filter. */
  pxPerCqw?: number;
  /** How far the (larger) box it is drawn into reaches past the block's own on each side, in cqw (only with `pxPerCqw`). */
  bleedCqw?: number;
}

/** Draws the shape into `root`; `update` draws it again. */
export function renderShape(root: HTMLElement, props: ShapeRenderProps, ctx: ShapeRenderContext): { update(props: ShapeRenderProps): void; destroy(): void };

/** The shape as the markup of an SVG. */
export function shapeSvgMarkup(block: ShapeRenderBlock, slideAspect: number, pxPerCqw?: number, bleedCqw?: number): string;

export function shapeGradientId(blockId: string): string;
export function shapePolygonPoints(sides: number): [number, number][];
export function shapeStarPoints(points: number, innerRadiusPercent: number): [number, number][];
export function shapeRoundedRectPath(radii: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }, boxAspect: number): string;
