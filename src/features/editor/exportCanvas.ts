import html2canvas from "html2canvas";

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
