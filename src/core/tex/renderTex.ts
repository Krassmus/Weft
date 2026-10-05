import katex from "katex";

const cache = new Map<string, string>();

/**
 * Renders a TeX formula to KaTeX's HTML (display mode: fractions/sums get their full size, and a
 * top-level `\\` starts a new line). Never throws - a syntax error shows up in the output as
 * KaTeX's own red error text instead, so a half-typed formula in the editor just looks "broken"
 * until it's finished rather than crashing the canvas. `trust` stays off: no \href/\includegraphics.
 *
 * Shared by the editor (live) and buildRuntimeHtml.ts (pre-rendered into the exported player,
 * which therefore needs no KaTeX script of its own - only the CSS from katexCss.ts).
 */
export function renderTexToHtml(tex: string): string {
  const cached = cache.get(tex);
  if (cached !== undefined) return cached;
  const html = katex.renderToString(tex, {
    displayMode: true,
    throwOnError: false,
    output: "htmlAndMathml",
    // A top-level `\\` is exactly how a multi-line formula is written here; KaTeX only warns that
    // real LaTeX would ignore it in display mode.
    strict: (code) => (code === "newLineInDisplayMode" ? "ignore" : "warn"),
  });
  if (cache.size > 200) cache.clear();
  cache.set(tex, html);
  return html;
}
