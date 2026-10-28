/** What a checker says (see render.js). */
export interface CheckerRenderProps {
  id: string;
  /** The words beside the box, in the language that is shown. */
  text: string;
}

/** What the place a checker is drawn in provides (see render.js). */
export interface CheckerRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  icons: { submit: string; thanks: string; unchecked: string; checked: string };
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
  fill(): void;
  submit(result: { ticked: boolean }): void;
  announce(text: string): void;
}

export interface CheckerRenderInstance {
  update(props: CheckerRenderProps): void;
  destroy(): void;
}

export function renderChecker(root: HTMLElement, props: CheckerRenderProps, ctx: CheckerRenderContext): CheckerRenderInstance;
