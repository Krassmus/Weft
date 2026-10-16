import type { WeftModule } from "../types";

/**
 * How often each of `colors` ("#rrggbb") is used on the slides: every place in the slides' elements (and the layouts', which show
 * on the slides) that has the colour - a text colour, a fill, a border, a shadow, a gradient point, a button's look, the colour of
 * a part of a text, in either way of writing it (#rrggbb, or rgb(r, g, b) as the editor of a text writes it). The colour scheme itself
 * is not counted. Returns the counts in the order of `colors`.
 */
export function countColorUsage(content: Pick<WeftModule, "pages" | "layouts">, colors: string[]): number[] {
  // (Everything in the slides as one text: colours sit in many different fields, and in the markup of the texts.)
  const text = JSON.stringify([content.pages, content.layouts]).toLowerCase();
  return colors.map((color) => {
    const hex = color.trim().toLowerCase();
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
    if (!match) return 0;
    const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16));
    const pattern = new RegExp(`${hex}(?![0-9a-f])|rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)`, "g");
    return (text.match(pattern) ?? []).length;
  });
}
