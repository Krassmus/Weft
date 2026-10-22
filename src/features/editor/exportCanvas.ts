import html2canvas from "html2canvas";
import { BACKDROP_BLUR_CQW, blurPixels, hasBackdropBlur } from "../../core/document/backdropBlur";
import type { Block } from "../../core/types";

/**
 * The picture of a drawn slide for the PDF and the cover (html2canvas), with the colours made readable for it: the browser gives a colour
 * that was mixed in CSS (color-mix(), what the slide's look is made of - tints of the accent colour, the colours of right and wrong, a
 * card's translucent fill) as `color(srgb 0.2 0.4 1 / 0.5)`, which html2canvas cannot read ("unsupported color function"). In the copy of the
 * page it draws from, every such colour is written as rgba() first.
 */

const SRGB = /color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+%?))?\s*\)/g;

/** `text` with every `color(srgb …)` in it as `rgba(…)`. */
export function colorFunctionsAsRgba(text: string): string {
  return text.replace(SRGB, (_all, r: string, g: string, b: string, a?: string) => {
    const channel = (value: string) => Math.round(Math.min(1, Math.max(0, Number(value))) * 255);
    const alpha = a === undefined ? 1 : a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
    return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${Math.round(alpha * 1000) / 1000})`;
  });
}

/** What can carry a colour, as the properties html2canvas asks the page for. */
const COLOR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "stop-color",
];

export function resolveColorFunctions(root: Document): void {
  const view = root.defaultView;
  if (!view) return;
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const style = view.getComputedStyle(element);
    for (const property of COLOR_PROPERTIES) {
      const value = style.getPropertyValue(property);
      if (value && value.includes("color(")) element.style.setProperty(property, colorFunctionsAsRgba(value), "important");
    }
  }
}

export interface DrawOptions {
  width: number;
  height: number;
  /** The sharpness of the picture: this many pixels per pixel of the slide. */
  scale: number;
  backgroundColor?: string;
}

/** The picture of the content of `holder` (a drawn slide, laid out off the screen). */
export function drawHolder(holder: HTMLElement, options: DrawOptions): Promise<HTMLCanvasElement> {
  return html2canvas(holder, {
    scale: options.scale,
    backgroundColor: options.backgroundColor ?? "#ffffff",
    logging: false,
    useCORS: true,
    width: options.width,
    height: options.height,
    onclone: (clonedDocument) => resolveColorFunctions(clonedDocument),
  });
}

/**
 * The background of a block that blurs it, as a picture: `below` is the slide as far as it is drawn under the block; blurred as the browser
 * blurs it (backdrop-filter), cut to the block's box. A turned block gets the picture turned back, so that it lies right once the block is.
 */
export function backdropPicture(below: HTMLCanvasElement, block: Block): string | null {
  const { x, y, width, height, rotation } = block.position;
  const w = Math.round((width / 100) * below.width);
  const h = Math.round((height / 100) * below.height);
  if (w < 1 || h < 1) return null;
  const copy = document.createElement("canvas");
  copy.width = below.width;
  copy.height = below.height;
  const copyContext = copy.getContext("2d");
  if (!copyContext) return null;
  copyContext.drawImage(below, 0, 0);
  const pixels = copyContext.getImageData(0, 0, copy.width, copy.height);
  blurPixels(pixels.data, copy.width, copy.height, BACKDROP_BLUR_CQW * (below.width / 100));
  copyContext.putImageData(pixels, 0, 0);

  const picture = document.createElement("canvas");
  picture.width = w;
  picture.height = h;
  const context = picture.getContext("2d");
  if (!context) return null;
  const centreX = (x / 100) * below.width + w / 2;
  const centreY = (y / 100) * below.height + h / 2;
  context.translate(w / 2, h / 2);
  if (rotation) context.rotate((-rotation * Math.PI) / 180);
  context.drawImage(copy, -centreX, -centreY);
  return picture.toDataURL(rotation ? "image/png" : "image/jpeg", 0.92);
}

/**
 * The picture of a slide whose blocks may blur what is behind them. The browser's own filter is not something html2canvas draws, so for
 * every such block (in the order they lie): the slide is drawn as far as it lies under that block, that is blurred and cut out, and it
 * becomes the block's background - `render` is given the blocks to show and these backgrounds, and has the slide drawn into `holder`.
 * A slide without such a block is drawn once, as before.
 */
export async function drawSlide(
  holder: HTMLElement,
  blocks: Block[],
  render: (shown: Block[], backdrops: Record<string, string>) => Promise<void>,
  options: DrawOptions,
): Promise<HTMLCanvasElement> {
  const backdrops: Record<string, string> = {};
  for (let i = 0; i < blocks.length; i++) {
    if (!hasBackdropBlur(blocks[i])) continue;
    await render(blocks.slice(0, i), backdrops);
    const picture = backdropPicture(await drawHolder(holder, options), blocks[i]);
    if (picture) backdrops[blocks[i].id] = picture;
  }
  await render(blocks, backdrops);
  return drawHolder(holder, options);
}
