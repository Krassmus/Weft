/** What an embedded page says (see render.js). */
export interface IframeRenderProps {
  id: string;
  url: string;
  sandbox: string[];
  allow?: string;
  qrCode: boolean;
  presentationUrl?: string;
  forcedViewportWidth?: number;
  /** The block's shape on the slide: height : width. */
  heightOverWidth: number;
  /** The QR code for `url` as an SVG; null: there is none. */
  qrSvg: string | null;
}

/** What the place an embedded page is drawn in provides (see render.js). */
export interface IframeRenderContext {
  mode: "play" | "edit" | "thumbnail" | "print";
  text(key: string): string;
  /** The SVG of the grey box of a thumbnail. */
  icons?: { globe: string; qr: string };
}

export interface IframeRenderInstance {
  update(props: IframeRenderProps): void;
  destroy(): void;
}

export const DEFAULT_VIEWPORT_WIDTH: number;
export function renderIframe(root: HTMLElement, props: IframeRenderProps, ctx: IframeRenderContext): IframeRenderInstance;
