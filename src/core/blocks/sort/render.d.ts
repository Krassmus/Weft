/** One object of a sorting puzzle, in the language that is shown (see render.js). */
export interface SortRenderItem {
  id: string;
  kind: "text" | "image";
  /** A text's words; a picture's description. */
  text: string;
  /** The address of a picture; "": none yet. */
  src: string;
}

/** What a sorting puzzle says (see render.js). */
export interface SortRenderProps {
  id: string;
  /** The objects in their RIGHT order. */
  items: SortRenderItem[];
  orientation?: "vertical" | "horizontal";
  itemSize: { width: number; height: number };
  startLabel?: string;
  endLabel?: string;
}

/** What the place a sorting puzzle is drawn in provides (see render.js). */
export interface SortRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  textWith(key: string, values: Record<string, string | number>): string;
  icons: { submit: string; correct: string; incorrect: string };
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
  reducedMotion?: () => boolean;
  fill(): void;
  submit(result: { moves: number; allRight: boolean }): void;
  announce(text: string): void;
  enlarge(src: string, alt: string): void;
}

export interface SortRenderInstance {
  update(props: SortRenderProps): void;
  destroy(): void;
}

export function sortShuffled(ids: string[]): string[];
export function sortMistakes(places: number[]): { moves: number; stays: Record<number, boolean> };
export function sortLayout(block: { orientation?: "vertical" | "horizontal"; itemSize: { width: number; height: number }; items: unknown[] }): { lines: number; per: number };
export function sortDropIndex(per: number, boxes: { along: number; cross: number }[], dragged: number, along: number, cross: number): number;
export function renderSort(root: HTMLElement, props: SortRenderProps, ctx: SortRenderContext): SortRenderInstance;
