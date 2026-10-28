import type { ListMarkerKind } from "../../types";

/** What a list says (see render.js). */
export interface ListRenderProps {
  /** Its points as HTML in the language that is shown. */
  items: { id: string; html: string }[];
  marker: ListMarkerKind;
  /** The colour of a dot, a dash or a number ("": that of the text). */
  markerColor?: string | null;
  /** The address of the picture of the marker "image". */
  markerSrc?: string | null;
  /** The height of that picture in em of the text. */
  markerSize?: number;
  /** The space between two points in cqw. */
  spacing: number;
}

/** What the place a list is drawn in provides (see render.js). */
export interface ListRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
}

export interface ListRenderInstance {
  /** The element of every point, by its id. */
  rows: Record<string, HTMLElement>;
  update(props: ListRenderProps): void;
  destroy(): void;
}

export function renderList(root: HTMLElement, props: ListRenderProps, ctx: ListRenderContext): ListRenderInstance;
