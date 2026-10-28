/** What a link says (see render.js). */
export interface LinkRenderProps {
  /** Where it leads; "": nowhere. */
  href: string;
  /** Its words in the language that is shown; "": the symbol alone. */
  label: string;
}

/** What the place a link is drawn in provides (see render.js). */
export interface LinkRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  /** The SVG of the globe in front of the words. */
  icon: string;
  /** Opens the address where a click cannot do it itself. */
  open?: (href: string) => void;
}

export interface LinkRenderInstance {
  update(props: LinkRenderProps): void;
  destroy(): void;
}

export function linkHref(url: string | undefined): string;
export function renderLink(root: HTMLElement, props: LinkRenderProps, ctx: LinkRenderContext): LinkRenderInstance;
