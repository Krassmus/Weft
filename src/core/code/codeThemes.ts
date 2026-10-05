import atomOneDark from "highlight.js/styles/atom-one-dark.css?raw";
import atomOneLight from "highlight.js/styles/atom-one-light.css?raw";
import github from "highlight.js/styles/github.css?raw";
import githubDark from "highlight.js/styles/github-dark.css?raw";
import monokai from "highlight.js/styles/monokai.css?raw";
import nord from "highlight.js/styles/nord.css?raw";

export const CODE_THEMES: { id: string; label: string; css: string }[] = [
  { id: "atom-one-dark", label: "Atom One Dark", css: atomOneDark },
  { id: "github-dark", label: "GitHub Dark", css: githubDark },
  { id: "monokai", label: "Monokai", css: monokai },
  { id: "nord", label: "Nord", css: nord },
  { id: "github", label: "GitHub", css: github },
  { id: "atom-one-light", label: "Atom One Light", css: atomOneLight },
];

export const DEFAULT_CODE_THEME = "atom-one-dark";

export function codeThemeClass(themeId: string): string {
  return `weft-code-theme-${CODE_THEMES.some((t) => t.id === themeId) ? themeId : DEFAULT_CODE_THEME}`;
}

/**
 * One highlight.js theme as CSS that only applies inside `.weft-code-theme-<id>` - the stock
 * stylesheets all target a global `.hljs`, so two themes on the same slide (or in the editor,
 * which shows every theme at once) would otherwise override each other. The theme's own base rule
 * (colors/background of `.hljs`) lands on the scope element itself, token rules (`.hljs-keyword`
 * ...) on its descendants; the stock `pre code.hljs`/`code.hljs` layout rules are dropped, since
 * the block lays its own text out (see .weft-code in App.css/player.runtime.css).
 */
function scopedThemeCss(theme: { id: string; css: string }): string {
  const scope = `.weft-code-theme-${theme.id}`;
  return theme.css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^{}]+)\{([^{}]*)\}/g, (_rule, selectors: string, body: string) => {
      const kept = selectors
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !/^(pre\s+)?code\b/.test(s))
        .map((s) => (s === ".hljs" ? scope : `${scope} ${s}`));
      return kept.length ? `${kept.join(",")}{${body}}\n` : "";
    });
}

/** The scoped CSS of the given themes (ids), or of all of them when omitted. */
export function buildCodeThemeCss(themeIds?: Iterable<string>): string {
  const wanted = themeIds ? new Set(themeIds) : null;
  return CODE_THEMES.filter((t) => !wanted || wanted.has(t.id))
    .map(scopedThemeCss)
    .join("");
}
