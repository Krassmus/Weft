import type { CustomFont, WeftModule } from "../types";
import { CURATED_FONTS } from "./curatedFonts";
import type { CuratedFont } from "./curatedFonts";

/** The font text renders in when nothing else is explicitly chosen - see the matching
 * font-family rule in player.runtime.css/App.css. Always bundled below (not just when
 * explicitly referenced by a <font face> tag), since otherwise a module whose text never
 * explicitly sets a font would silently lose its default in export. */
export const DEFAULT_FONT_FAMILY = "Open Sans";

/** All rich-HTML in the module carrying a font-family/font-face value applied via richText.ts's
 * applyFormat - text block HTML (pages and layouts alike), plus a quiz block's question and its
 * options (quiz blocks only ever live on pages, never layouts - see StaticBlock/Block in
 * types.ts). Missing the quiz case here used to mean a curated font used only inside a quiz
 * question/option was never detected as "used" and so never got bundled into the preview/export
 * @font-face CSS - it still rendered correctly on the editor CANVAS, which loads every curated
 * font unconditionally (see fonts.css), so the gap only showed up once you actually previewed or
 * exported. */
function allTextHtml(module: WeftModule): string {
  const html: string[] = [];
  for (const page of Object.values(module.pages)) {
    for (const block of page.blocks) {
      if (block.kind === "text") html.push(block.html);
      else if (block.kind === "quiz") {
        html.push(block.questionHtml);
        for (const option of block.options) html.push(option.html);
      }
    }
  }
  for (const layout of Object.values(module.layouts)) {
    for (const block of layout.blocks) if (block.kind === "text") html.push(block.html);
  }
  return html.join("\n");
}

/** Which curated fonts this document's content actually references - only these get bundled
 * into an export, so picking a font from the list is a guarantee (unlike a system font, which
 * may simply not be installed wherever the module ends up playing), without bundling all eleven
 * into every single export regardless of use. */
export function usedCuratedFonts(module: WeftModule): CuratedFont[] {
  const html = allTextHtml(module);
  return CURATED_FONTS.filter((font) => font.family === DEFAULT_FONT_FAMILY || html.includes(`face="${font.family}"`));
}

/**
 * Builds the @font-face CSS for every curated font this document uses plus every custom font it
 * carries, resolving each underlying file to a URL through the given callbacks - a relative
 * "fonts/…" zip path for the real export, or a data: URI for the sandboxed preview iframe (an
 * opaque-origin srcDoc can't fetch a relative path at all, same reason images go through
 * buildPreviewAssetUrls instead of a plain <img src="assets/…">).
 */
export async function buildFontFaceCss(
  module: WeftModule,
  resolveCuratedFile: (fileName: string) => Promise<string>,
  resolveCustomFont: (font: CustomFont) => Promise<string>,
): Promise<string> {
  const rules: string[] = [];

  for (const font of usedCuratedFonts(module)) {
    for (const face of font.faces) {
      const url = await resolveCuratedFile(face.file);
      const unicodeRange = face.unicodeRange ? `unicode-range:${face.unicodeRange};` : "";
      rules.push(
        `@font-face{font-family:'${escapeFontFamily(font.family)}';font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url('${url}') format('woff2');${unicodeRange}}`,
      );
    }
  }

  for (const font of module.customFonts) {
    const url = await resolveCustomFont(font);
    rules.push(`@font-face{font-family:'${escapeFontFamily(font.family)}';font-display:swap;src:url('${url}');}`);
  }

  return rules.join("\n");
}

function escapeFontFamily(family: string): string {
  return family.replace(/['\\]/g, "\\$&");
}
