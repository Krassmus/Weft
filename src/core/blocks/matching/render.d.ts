/** One card of a matching, in the language that is shown (see render.js). */
export interface MatchingRenderCard {
  id: string;
  kind: "text" | "image";
  /** A text card's words; a picture's description. */
  text: string;
  /** The address of a picture; "": none yet. */
  src: string;
  x: number;
  y: number;
}

/** What a matching says (see render.js). */
export interface MatchingRenderProps {
  id: string;
  sources: MatchingRenderCard[];
  targets: MatchingRenderCard[];
  /** The right assignment: source id -> target id. */
  pairs?: Record<string, string>;
  sourceSize: { width: number; height: number };
  targetSize: { width: number; height: number };
  shuffle?: boolean;
}

export type MatchingStatus = "correct" | "wrong" | "missed" | "ok";

/** What the place a matching is drawn in provides (see render.js). */
export interface MatchingRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  icons: { submit: string; correct: string; incorrect: string };
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
  fill(): void;
  submit(result: { results: { id: string; status: MatchingStatus; rightId?: string }[]; allRight: boolean }): void;
  announce(text: string): void;
  enlarge(src: string, alt: string): void;
}

export interface MatchingRenderInstance {
  update(props: MatchingRenderProps): void;
  destroy(): void;
}

export function renderMatching(root: HTMLElement, props: MatchingRenderProps, ctx: MatchingRenderContext): MatchingRenderInstance;
