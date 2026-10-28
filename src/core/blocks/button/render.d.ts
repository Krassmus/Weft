import type { ButtonAppearance } from "../../types";

/** What a button says (see render.js). */
export interface ButtonRenderProps {
  /** The label as HTML in the language that is shown; "": it has no words (the player's own "Weiter" stands there). */
  html: string;
  /** The look the author gave it, as CSS text (see buttonLookStyle). */
  look: string;
}

/** What the place a button is drawn in provides (see render.js). */
export interface ButtonRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
}

export interface ButtonRenderInstance {
  /** The element a click lands on: the player adds its listeners to it (a real button only in "play"). */
  button: HTMLButtonElement;
  update(props: ButtonRenderProps): void;
  destroy(): void;
}

export function buttonLookStyle(look: ButtonAppearance | undefined): string;
export function renderButton(root: HTMLElement, props: ButtonRenderProps, ctx: ButtonRenderContext): ButtonRenderInstance;
