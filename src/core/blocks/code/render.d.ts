/** What the block says: the code highlighted, as HTML, and how it looks. */
export interface CodeRenderProps {
  html: string;
  /** The id of a theme (core/code/codeThemes.ts). */
  theme: string;
  /** In px on a slide 960 px wide. */
  fontSize: number;
  transparentBackground?: boolean;
}

/** What the place it is drawn in provides. */
export interface CodeRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  /** The editor's own words: "enterCode" (what a block without code says outside the player). */
  text?(key: "enterCode"): string;
}

/** Draws the code into `root`; `update` draws it again. */
export function renderCode(root: HTMLElement, props: CodeRenderProps, ctx: CodeRenderContext): { update(props: CodeRenderProps): void; destroy(): void };
