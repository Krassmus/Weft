import QRCode from "qrcode";
// The LMS client library (Stud.IP counterpart lives in its plugin) - embedded unchanged, ahead of the
// player, which talks to it (see syncLms in player.runtime.js).
import vanillaLmSource from "../../../mockups/VanillaLM.js?raw";
import playerRuntimeSource from "./player.runtime.js?raw";
import playerRuntimeCss from "./player.runtime.css?raw";
import { parseExpression } from "../document/expressions";
import type { Expr } from "../document/expressions";
import { isComputedVariable } from "../document/variables";
import { buildCodeThemeCss } from "../code/codeThemes";
import { highlightCodeToHtml } from "../code/highlight";
import { buildKatexCss } from "../tex/katexCss";
import { renderTexToHtml } from "../tex/renderTex";
import type { Block, IframeBlock, TexBlock, WeftModule } from "../types";

/**
 * Produces the stand-alone index.html for a module: same function for the real HTML export
 * (assetUrls empty, images resolved as relative assets/<id>_<name> paths written into the zip)
 * and for the editor's live sandboxed-iframe preview (assetUrls pre-resolved to data: URIs,
 * since a sandboxed srcDoc iframe has an opaque origin and can't reach the app's blob: URLs).
 * fontFaceCss is built the same asymmetric way - see core/fonts/fontFaceCss.ts and its two
 * callers (pack.ts for export, buildPreviewFontUrls.ts for preview).
 *
 * startPageId is preview-only (pack.ts's own export call never passes one, so a real exported
 * module always starts from its actual beginning like a real learner would) - it's the page
 * "Abspielen" should open directly on, e.g. whichever slide was selected in the editor (see
 * Canvas.tsx/PresentationView.tsx). Kept out of the `module` object itself (a plain sibling
 * script tag instead, same as assetUrls/qrCodeSvgs) since it's a preview-session detail, not
 * document content - it has no business being part of WeftModule's own persisted shape.
 */
export async function buildRuntimeHtml(
  module: WeftModule,
  assetUrls: Record<string, string> = {},
  fontFaceCss = "",
  startPageId: string | null = null,
): Promise<string> {
  const qrCodeSvgs = await buildQrCodeSvgs(module);
  const texHtml = buildTexHtml(module);
  const hasTex = Object.keys(texHtml).length > 0;
  const { codeHtml, codeThemeIds } = buildCodeHtml(module);
  const computedExpressions = buildComputedExpressions(module);

  // Escaping every "<" keeps the embedded JSON from ever containing a literal "</script>",
  // while remaining valid JSON (< decodes back to "<" on JSON.parse).
  const moduleJson = JSON.stringify(module).replace(/</g, "\\u003c");
  const assetUrlsJson = JSON.stringify(assetUrls).replace(/</g, "\\u003c");
  const qrCodeSvgsJson = JSON.stringify(qrCodeSvgs).replace(/</g, "\\u003c");
  const texHtmlJson = JSON.stringify(texHtml).replace(/</g, "\\u003c");
  const codeHtmlJson = JSON.stringify(codeHtml).replace(/</g, "\\u003c");
  const computedJson = JSON.stringify(computedExpressions).replace(/</g, "\\u003c");
  const startPageIdJson = JSON.stringify(startPageId).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(module.title)}</title>
<style>${playerRuntimeCss}</style>
<style>${fontFaceCss}</style>
${codeThemeIds.size > 0 ? `<style>${buildCodeThemeCss(codeThemeIds)}</style>\n` : ""}${hasTex ? `<style>${buildKatexCss()}</style>\n` : ""}</head>
<body>
<div id="weft-root"></div>
<script id="weft-data" type="application/json">${moduleJson}</script>
<script id="weft-asset-urls" type="application/json">${assetUrlsJson}</script>
<script id="weft-qr-codes" type="application/json">${qrCodeSvgsJson}</script>
<script id="weft-computed" type="application/json">${computedJson}</script>
<script id="weft-code-html" type="application/json">${codeHtmlJson}</script>
<script id="weft-tex-html" type="application/json">${texHtmlJson}</script>
<script id="weft-start-page" type="application/json">${startPageIdJson}</script>
<script>${vanillaLmSource.replace(/<\/script/gi, "<\\/script")}</script>
<script>${playerRuntimeSource}</script>
</body>
</html>
`;
}

/** The syntax tree of every computed variable's formula, keyed by variable id - parsed here once so
 * the player only has to evaluate trees (its evalExpression), never to know the language itself. A
 * formula that doesn't parse is `null`: the variable then reads as false. */
function buildComputedExpressions(module: WeftModule): Record<string, Expr | null> {
  const trees: Record<string, Expr | null> = {};
  for (const variable of module.variables) {
    if (!isComputedVariable(variable)) continue;
    const parsed = parseExpression(variable.expression ?? "");
    trees[variable.id] = parsed.ok ? parsed.expr : null;
  }
  return trees;
}

/** Every code block (page or layout), keyed by block id, highlighted to HTML here once - plus which
 * themes are in use, so only their CSS gets embedded. Like TeX, the player itself never runs the
 * highlighter. */
function buildCodeHtml(module: WeftModule): { codeHtml: Record<string, string>; codeThemeIds: Set<string> } {
  const blocks: Block[] = [
    ...Object.values(module.pages).flatMap((page) => page.blocks),
    ...Object.values(module.layouts).flatMap((layout) => layout.blocks),
  ];
  const codeHtml: Record<string, string> = {};
  const codeThemeIds = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== "code") continue;
    codeHtml[block.id] = highlightCodeToHtml(block.code, block.language);
    codeThemeIds.add(block.theme);
  }
  return { codeHtml, codeThemeIds };
}

/** Every TeX block (page or layout), keyed by block id, typeset to KaTeX HTML - done here once so the
 * player never needs KaTeX itself, only its stylesheet (embedded just when this is non-empty). */
function buildTexHtml(module: WeftModule): Record<string, string> {
  const blocks: TexBlock[] = [];
  for (const page of Object.values(module.pages)) {
    for (const block of page.blocks) if (block.kind === "tex" && block.tex.trim()) blocks.push(block);
  }
  for (const layout of Object.values(module.layouts)) {
    for (const block of layout.blocks) if (block.kind === "tex" && block.tex.trim()) blocks.push(block);
  }
  return Object.fromEntries(blocks.map((block) => [block.id, renderTexToHtml(block.tex)]));
}

/** Every iframe block (page or layout) with QR mode on, keyed by block id, rendered to an inline SVG string. */
async function buildQrCodeSvgs(module: WeftModule): Promise<Record<string, string>> {
  const blocks: IframeBlock[] = [];
  for (const page of Object.values(module.pages)) {
    for (const block of page.blocks) if (block.kind === "iframe" && block.qrCode && block.url) blocks.push(block);
  }
  for (const layout of Object.values(module.layouts)) {
    for (const block of layout.blocks) if (block.kind === "iframe" && block.qrCode && block.url) blocks.push(block);
  }

  const entries = await Promise.all(
    blocks.map(async (block): Promise<[string, string] | null> => {
      try {
        const svg = await QRCode.toString(block.url, { type: "svg", margin: 1 });
        return [block.id, svg];
      } catch {
        return null;
      }
    }),
  );

  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
