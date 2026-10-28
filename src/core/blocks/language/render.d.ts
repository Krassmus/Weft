/** What a language switch says (see render.js). */
export interface LanguageRenderProps {
  /** The module's languages (locales like "de_DE"). */
  languages: string[];
  /** How each is called (its own name, with its flag). */
  labels: Record<string, string>;
  /** The one that is shown now. */
  current: string;
}

/** What the place a language switch is drawn in provides (see render.js). */
export interface LanguageRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  /** A language was picked. */
  setLanguage(locale: string): void;
}

export interface LanguageRenderInstance {
  update(props: LanguageRenderProps): void;
  destroy(): void;
}

export function renderLanguage(root: HTMLElement, props: LanguageRenderProps, ctx: LanguageRenderContext): LanguageRenderInstance;
