/** What a revealer says, in the language that is shown (see render.js). */
export interface RevealerRenderProps {
  id: string;
  /** The side of the icon in cqw. */
  size: number;
  /** Where the block stands, in percent of the slide's width. */
  x: number;
  iconSvg: string;
  signColor: string;
  color: string;
  title: string;
  /** Plain text, its lines kept. */
  body: string;
  /** The picture of the window; null: none. */
  imageSrc: string | null;
  imageAlt: string;
  windowStyle: "dark" | "light";
  /** The button of the window; null: none. */
  button: { text: string } | null;
  /** A picture only: the window stands open. */
  open?: boolean;
}

/** What the place a revealer is drawn in provides (see render.js). */
export interface RevealerRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  /** The icon was clicked to open the window. */
  opened(): void;
  announce(text: string): void;
}

export interface RevealerRenderInstance {
  /** The button of the window, if there is one: the player adds its listener. */
  button: HTMLButtonElement | null;
  open(): void;
  close(): void;
  update(props: RevealerRenderProps): void;
  destroy(): void;
}

export function renderRevealer(root: HTMLElement, props: RevealerRenderProps, ctx: RevealerRenderContext): RevealerRenderInstance;
