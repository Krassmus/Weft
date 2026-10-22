import type { CSSProperties } from "react";
import { revealerSignColor } from "../../core/runtime/revealerGeometry.js";
import { useDocumentStore } from "../../core/document/store";
import type { InteractiveStyle } from "../../core/types";

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
    style: accentColor ? ({ "--slide-accent": accentColor, "--slide-accent-fg": revealerSignColor(accentColor) } as CSSProperties) : {},
  };
}

/** The same for the module being edited. */
export function useStageTheme() {
  const brightness = useDocumentStore((s) => s.doc.content.brightness);
  const accentColor = useDocumentStore((s) => s.doc.content.accentColor);
  const interactiveStyle = useDocumentStore((s) => s.doc.content.interactiveStyle);
  return stageThemeProps(brightness, accentColor, interactiveStyle);
}
