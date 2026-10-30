/** What a quiz says, in the language that is shown (see render.js). */
export interface QuizRenderProps {
  id: string;
  /** The question as HTML. */
  question: string;
  /** The answers as HTML. */
  options: { id: string; html: string }[];
  /** The right answers (a test is right when exactly these are ticked). */
  correctOptionIds: string[];
  /** An open question: nothing is right or wrong. */
  open?: boolean;
  /** A required task: while the quiz has answers to pick, it cannot be submitted before one is picked (the button waits). Only where it is used. */
  required?: boolean;
  /** Only one answer can be picked (round buttons; ignored for an open question). */
  single?: boolean;
  /** The answers a script took away: their place stays empty and they cannot be picked. */
  hiddenOptionIds?: string[];
  /** What is told after the submit (plain text). */
  explanation?: string;
  /** For a picture: the answers that stand ticked in it. */
  marked?: string[];
}

/** What the place a quiz is drawn in provides (see render.js). */
export interface QuizRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  icons: { submit: string; correct: string; incorrect: string; unchecked: string; checked: string; radioUnchecked?: string; radioChecked?: string };
  /** Puts the values of variables in for the placeholders in the node (only the player has them). */
  applyVariables?: (node: HTMLElement) => void;
  fill(): void;
  submit(result: { ticked: string[]; correct: boolean }): void;
  announce(text: string): void;
}

export interface QuizRenderInstance {
  update(props: QuizRenderProps): void;
  destroy(): void;
}

export function renderQuiz(root: HTMLElement, props: QuizRenderProps, ctx: QuizRenderContext): QuizRenderInstance;
