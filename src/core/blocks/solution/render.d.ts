/** What a solution word says, in the language that is shown (see render.js). */
export interface SolutionRenderProps {
  id: string;
  solution: string;
  placeholder: string;
  caseSensitive?: boolean;
  attempts?: number;
}

/** What the place a solution word is drawn in provides (see render.js). */
export interface SolutionRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  textWith(key: string, values: Record<string, string | number>): string;
  icons: { submit: string; correct: string; incorrect: string };
  fill(): void;
  attempt(result: { right: boolean; finished: boolean }): void;
  announce(text: string): void;
}

export interface SolutionRenderInstance {
  update(props: SolutionRenderProps): void;
  destroy(): void;
}

export function solutionNormal(text: string, caseSensitive: boolean): string;
export function solutionIsRight(solution: string, typed: string, caseSensitive?: boolean): boolean;
export function renderSolution(root: HTMLElement, props: SolutionRenderProps, ctx: SolutionRenderContext): SolutionRenderInstance;
