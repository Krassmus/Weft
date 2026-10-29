/** What a gap text says, in the language that is shown (see render.js). */
export interface ClozeRenderProps {
  /** The text, the blanks written as [[answer]]. */
  html: string;
  caseSensitive?: boolean;
  /** How many characters of an answer may be wrong (0-2). */
  tolerance?: number;
}

/** What the place a gap text is drawn in provides (see render.js). */
export interface ClozeRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  textWith(key: string, values: Record<string, string | number>): string;
  icons: { submit: string; correct: string; incorrect: string };
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
  fill(): void;
  submit(result: { blanks: { key: string; right: boolean }[]; allRight: boolean }): void;
  announce(text: string): void;
}

export interface ClozeRenderInstance {
  update(props: ClozeRenderProps): void;
  destroy(): void;
}

export const CLOZE_MARKER: RegExp;
export function clozeLevenshtein(a: string, b: string): number;
export function clozeNormalise(text: string, caseSensitive: boolean): string;
export function clozeAllowedSlips(answerLength: number, tolerance: number): number;
export function clozeIsRight(given: string, answers: string[], caseSensitive: boolean, tolerance: number): boolean;
export function renderCloze(root: HTMLElement, props: ClozeRenderProps, ctx: ClozeRenderContext): ClozeRenderInstance;
