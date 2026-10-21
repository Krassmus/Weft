import type { CSSProperties } from "react";
import { revealerSignColor } from "../../core/runtime/revealerGeometry.js";
import { useDocumentStore } from "../../core/document/store";

/** What a slide's stage (the canvas, a thumbnail) needs to look the way the module's look makes it (see stageTheme.css): the attribute
 * for light or dark, and the accent colour with the colour of what stands on it. */
export function stageThemeProps(
  brightness: "light" | "dark" | undefined,
  accentColor: string | undefined,
): { "data-weft-theme": "light" | "dark"; style: CSSProperties } {
  return {
    "data-weft-theme": brightness === "dark" ? "dark" : "light",
    style: accentColor ? ({ "--slide-accent": accentColor, "--slide-accent-fg": revealerSignColor(accentColor) } as CSSProperties) : {},
  };
}

/** The same for the module being edited. */
export function useStageTheme() {
  const brightness = useDocumentStore((s) => s.doc.content.brightness);
  const accentColor = useDocumentStore((s) => s.doc.content.accentColor);
  return stageThemeProps(brightness, accentColor);
}
