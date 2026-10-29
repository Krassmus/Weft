/** What the block says: the formula typeset, as HTML, and its colour. */
export interface TexRenderProps {
  html: string;
  /** The colour of the whole formula; "" is the block's inherited colour. */
  color: string;
}

/** What the place it is drawn in provides. */
export interface TexRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  /** The editor's own words: "enterFormula" (what a block without a formula says outside the player). */
  text?(key: "enterFormula"): string;
}

/** Draws the formula into `root`; `update` draws it again. */
export function renderTex(root: HTMLElement, props: TexRenderProps, ctx: TexRenderContext): { update(props: TexRenderProps): void; destroy(): void };
