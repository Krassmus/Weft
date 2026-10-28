import type { TextBox } from "../types";
import { backdropBlurCss } from "./backdropBlur";

/** What a new text box looks like: a faint light card with a fine border (it follows the slide's colours: light on dark, and the other way round,
 * is a matter of the opacity). */
export const DEFAULT_TEXT_BOX: TextBox = {
  fill: "#ffffff",
  fillOpacity: 0.08,
  borderColor: "#ffffff",
  borderOpacity: 0.16,
  borderWidth: 0.12,
  radius: 1.2,
  padding: 1.5,
};

const mix = (color: string, opacity: number) => `color-mix(in srgb, ${color} ${Math.round(Math.max(0, Math.min(1, opacity)) * 100)}%, transparent)`;

/** The look of a text block's box as CSS (the editor's canvas; blocks/text/render.js's textBoxStyle writes the same as text for the player, the thumbnails and the PDF: keep them in step). */
export function textBoxCss(box: TextBox | undefined): { background?: string; border?: string; borderRadius?: string; padding?: string; boxSizing?: "border-box"; backdropFilter?: string; WebkitBackdropFilter?: string } {
  if (!box) return {};
  return {
    boxSizing: "border-box",
    background: box.fill ? mix(box.fill, box.fillOpacity) : undefined,
    border: box.borderColor && box.borderWidth > 0 ? `${box.borderWidth}cqw solid ${mix(box.borderColor, box.borderOpacity)}` : undefined,
    borderRadius: `${box.radius}cqw`,
    padding: `${box.padding}cqw`,
    ...(box.blur ? backdropBlurCss() : {}),
  };
}
