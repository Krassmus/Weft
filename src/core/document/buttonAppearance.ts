import type { ButtonAppearance, ButtonBlock } from "../types";

/** What a button looks like when nothing was set: the dark button it has always been (1px border, 6px corners on a 960px slide). */
export const DEFAULT_BUTTON_APPEARANCE: ButtonAppearance = {
  background: "#18181b",
  borderColor: "#18181b",
  borderWidth: 0.1,
  radius: 0.6,
};

export function buttonAppearanceOf(block: Pick<ButtonBlock, "appearance">): ButtonAppearance {
  return { ...DEFAULT_BUTTON_APPEARANCE, ...block.appearance };
}

/** The look as CSS (background, border, corners) - the editor's canvas and the thumbnails; the player writes the same by hand. */
export function buttonAppearanceCss(block: Pick<ButtonBlock, "appearance">): {
  background: string;
  border: string;
  borderRadius: string;
} {
  const look = buttonAppearanceOf(block);
  return {
    background: look.background ?? "transparent",
    border: look.borderWidth > 0 ? `${look.borderWidth}cqw solid ${look.borderColor}` : "none",
    borderRadius: `${look.radius}cqw`,
  };
}
