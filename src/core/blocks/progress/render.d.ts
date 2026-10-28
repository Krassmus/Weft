/** What a progress bar says (see render.js). */
export interface ProgressRenderProps {
  /** How full the bar is, 0 to 100. */
  value: number;
  /** How long the fill takes to move to a new value given by `update` (ms); 0: it jumps. */
  moveMs: number;
  color: string;
  trackColor: string;
  rounded: boolean;
  /** What the bar shows, in words, for whoever cannot see it. */
  label: string;
}

/** What the place a progress bar is drawn in provides (see render.js). */
export interface ProgressRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
}

export interface ProgressRenderInstance {
  update(props: ProgressRenderProps): void;
  destroy(): void;
}

export function renderProgress(root: HTMLElement, props: ProgressRenderProps, ctx: ProgressRenderContext): ProgressRenderInstance;
