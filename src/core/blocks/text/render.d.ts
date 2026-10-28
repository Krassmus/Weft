import type { TextBox } from "../../types";

/** What a text says (see render.js). */
export interface TextRenderProps {
  /** Its words as HTML in the language that is shown. */
  html: string;
  /** Text longer than the block scrolls (only where it is played). */
  scrollable: boolean;
  /** The look of its box; absent: none. */
  box?: TextBox;
}

/** What the place a text is drawn in provides (see render.js). */
export interface TextRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
}

export interface TextRenderInstance {
  update(props: TextRenderProps): void;
  destroy(): void;
}

export function textBoxStyle(box: TextBox | undefined): string;
export function renderText(root: HTMLElement, props: TextRenderProps, ctx: TextRenderContext): TextRenderInstance;
