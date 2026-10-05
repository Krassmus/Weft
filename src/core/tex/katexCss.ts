import katexCss from "katex/dist/katex.min.css?raw";

// Every KaTeX font as a data: URI - the exported index.html is stand-alone (and the preview's
// sandboxed srcDoc iframe can't reach the app's own asset URLs), so the stylesheet's relative
// `fonts/...` URLs have nowhere to resolve to.
const fontDataUris = import.meta.glob<string>("/node_modules/katex/dist/fonts/*.woff2", {
  query: "?inline",
  import: "default",
  eager: true,
});

let cached: string | null = null;

/** katex.min.css with its fonts inlined (woff2 only - every browser that can run the player has
 * it; the woff/ttf fallbacks would only triple the size). Only embedded for modules that actually
 * contain a TeX block (see buildRuntimeHtml.ts). */
export function buildKatexCss(): string {
  if (cached !== null) return cached;
  const byName = new Map<string, string>();
  for (const [path, uri] of Object.entries(fontDataUris)) byName.set(path.split("/").pop()!, uri);
  cached = katexCss
    // src: url(fonts/X.woff2) format("woff2"),url(fonts/X.woff) format("woff"),url(fonts/X.ttf) format("truetype")
    .replace(/url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\),url\([^)]*\) format\("woff"\),url\([^)]*\) format\("truetype"\)/g, (all, name: string) => {
      const uri = byName.get(name);
      return uri ? `url(${uri}) format("woff2")` : all;
    });
  return cached;
}
