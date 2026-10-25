import type { ButtonAppearance, ButtonBlock, WeftModule } from "../types";

/** What a button looks like when nothing was set about its border: none, and the quiz's submit button's corners (0.35em at its type
 * size of 1.7cqw). (The colour is the module's accent colour - see defaultButtonColor.) */
export const DEFAULT_BUTTON_APPEARANCE = {
  borderWidth: 0,
  radius: 0.595,
};

/** The colour of a button's background and border when the block has none of its own: the accent colour of the module's look, and
 * without one the blue of the quiz's submit button. */
export function defaultButtonColor(look: Pick<WeftModule, "accentColor"> | undefined): string {
  return look?.accentColor ?? "#3b82f6";
}

/** The look of a button with the parts it has no setting for filled in - for the editing panel (`look` is the module's: the colours). */
export function buttonAppearanceOf(
  block: Pick<ButtonBlock, "appearance">,
  look?: Pick<WeftModule, "accentColor">,
): Required<ButtonAppearance> {
  const color = defaultButtonColor(look);
  const set = block.appearance ?? {};
  return {
    background: set.background === undefined ? color : set.background,
    borderColor: set.borderColor ?? color,
    borderWidth: set.borderWidth ?? DEFAULT_BUTTON_APPEARANCE.borderWidth,
    radius: set.radius ?? DEFAULT_BUTTON_APPEARANCE.radius,
  };
}

/** The look as CSS (background, border, corners) - the editor's canvas and the thumbnails; the player writes the same by hand. What the
 * block has no setting for is the stage's colour (`--slide-button-bg`, see stageTheme.css), which is the module's accent colour. */
export function buttonAppearanceCss(block: Pick<ButtonBlock, "appearance">): {
  background: string;
  border: string;
  borderRadius?: string;
  /** The border as colour and width, for the futuristic style, which draws it again along its cut corners (see stageTheme.css). */
  "--slide-cut-line"?: string;
  "--slide-cut-line-width"?: string;
} {
  const set = block.appearance ?? {};
  const color = "var(--slide-button-bg)";
  const width = set.borderWidth ?? DEFAULT_BUTTON_APPEARANCE.borderWidth;
  return {
    background: set.background === undefined ? color : (set.background ?? "transparent"),
    border: width > 0 ? `${width}cqw solid ${set.borderColor ?? color}` : "none",
    // (Without one of its own the corners are the style of the interactive elements', see stageTheme.css.)
    borderRadius: set.radius === undefined ? undefined : `${set.radius}cqw`,
    ...(width > 0 ? { "--slide-cut-line": set.borderColor ?? color, "--slide-cut-line-width": `${width}cqw` } : {}),
  };
}
