import type { CSSProperties } from "react";
import { accentInk } from "../../core/runtime/accentContrast.js";
import { revealerSignColor } from "../../core/runtime/revealerGeometry.js";
import { useDocumentStore } from "../../core/document/store";
import type { InteractiveStyle } from "../../core/types";

/** The accent colour as the stage's own values: the colour of what stands on it, and the colour it is drawn in on the slide (see accentContrast.js:
 * the colour itself, or mixed with white or black as far as it takes to stand out from the slide's background). */
function accentStyle(accentColor: string, background: string): CSSProperties {
  return {
    "--slide-accent": accentColor,
    "--slide-accent-fg": revealerSignColor(accentColor),
    "--slide-accent-ink": accentInk(accentColor, background, 3),
    "--slide-accent-ink-text": accentInk(accentColor, background, 4.5),
  } as CSSProperties;
}

/** What a slide's stage (the canvas, a thumbnail) needs to look the way the module's look makes it (see stageTheme.css): the attribute
 * for light or dark, and the accent colour with the colour of what stands on it. */
export function stageThemeProps(
  brightness: "light" | "dark" | undefined,
  accentColor: string | undefined,
  interactiveStyle?: InteractiveStyle,
): { "data-weft-theme": "light" | "dark"; "data-weft-style": InteractiveStyle; style: CSSProperties } {
  return {
    "data-weft-theme": brightness === "dark" ? "dark" : "light",
    "data-weft-style": interactiveStyle ?? "plain",
    style: accentColor ? accentStyle(accentColor, brightness === "dark" ? "#18181b" : "#ffffff") : {},
  };
}

/** The same for the module being edited. */
export function useStageTheme() {
  const brightness = useDocumentStore((s) => s.doc.content.brightness);
  const accentColor = useDocumentStore((s) => s.doc.content.accentColor);
  const interactiveStyle = useDocumentStore((s) => s.doc.content.interactiveStyle);
  return stageThemeProps(brightness, accentColor, interactiveStyle);
}
