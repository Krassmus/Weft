/**
 * The HTML of a text, made from a plain description (what `add_text` takes): paragraphs of runs with size, colour, weight, typeface. The
 * markup is the one the editor writes - <b>, <i>, <font face color>, <span style="font-size:..cqw"> - so that the editor's toolbar shows and
 * changes it like any other text. The words are escaped; markup of one's own goes in `html`.
 */

export interface Run {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  /** cqw (percent of the slide's width; the standard text is 1.7). */
  size?: number;
  font?: string;
}

export interface TextSpec {
  text?: string;
  paragraphs?: (string | (string | Run)[])[];
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right" | "justify";
  font?: string;
  lineHeight?: number;
  /** The space between paragraphs, cqw. */
  gap?: number;
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function runHtml(run: Run, base: TextSpec): string {
  const size = run.size ?? base.size;
  const color = run.color ?? base.color;
  const bold = run.bold ?? base.bold;
  const italic = run.italic ?? base.italic;
  const font = run.font ?? base.font;
  let html = escapeText(run.text).replace(/\n/g, "<br>");
  if (bold) html = `<b>${html}</b>`;
  if (italic) html = `<i>${html}</i>`;
  // A colour that is not a hex one (rgba(...)) cannot go in <font color> - it would not be read.
  if (color) html = HEX.test(color) ? `<font color="${color}">${html}</font>` : `<span style="color:${color}">${html}</span>`;
  if (size) html = `<span style="font-size:${size}cqw">${html}</span>`;
  if (font) html = `<font face="${font}">${html}</font>`;
  return html;
}

function paragraphs(spec: TextSpec): (string | (string | Run)[])[] {
  if (spec.paragraphs) return spec.paragraphs;
  return String(spec.text ?? "")
    .split("\n")
    .map((line) => line);
}

const runsOf = (paragraph: string | (string | Run)[]): Run[] =>
  (Array.isArray(paragraph) ? paragraph : [paragraph]).map((part) => (typeof part === "string" ? { text: part } : part));

export function buildTextHtml(spec: TextSpec): string {
  const lineHeight = spec.lineHeight ?? 1.25;
  const gap = spec.gap ?? 0;
  return paragraphs(spec)
    .map((paragraph) => {
      const style = `line-height:${lineHeight};margin:0 0 ${gap}cqw 0;${spec.align ? `text-align:${spec.align};` : ""}`;
      return `<p style="${style}">${runsOf(paragraph).map((run) => runHtml(run, spec)).join("")}</p>`;
    })
    .join("");
}

/**
 * How high a text block has to be (percent of the slide's height) for the text to fit - an estimate from the number of characters (a letter is
 * about half an em wide), good enough to start from; `weft validate --layout` tells exactly.
 */
export function estimateHeightPercent(spec: TextSpec, widthPercent: number, aspect: number, padding = 0.8): number {
  const lineHeight = spec.lineHeight ?? 1.25;
  const gap = spec.gap ?? 0;
  const room = Math.max(1, widthPercent - 2 * padding);
  let heightCqw = 0;
  for (const paragraph of paragraphs(spec)) {
    const runs = runsOf(paragraph);
    const size = Math.max(spec.size ?? 1.7, ...runs.map((r) => r.size ?? 0));
    const chars = runs.reduce((sum, r) => sum + r.text.length * (r.size ?? spec.size ?? 1.7) * (r.bold ?? spec.bold ? 0.56 : 0.52), 0);
    const lines = Math.max(1, Math.ceil(chars / room), runs.reduce((n, r) => n + (r.text.split("\n").length - 1), 1));
    heightCqw += size * lineHeight * lines + gap;
  }
  const slideHeightCqw = 100 / aspect;
  return Math.round(((heightCqw + 2 * padding) / slideHeightCqw) * 1000) / 10;
}
