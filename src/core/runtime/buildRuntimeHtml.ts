import QRCode from "qrcode";
import playerRuntimeSource from "./player.runtime.js?raw";
import playerRuntimeCss from "./player.runtime.css?raw";
import type { IframeBlock, WeftModule } from "../types";

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

  // Escaping every "<" keeps the embedded JSON from ever containing a literal "</script>",
  // while remaining valid JSON (< decodes back to "<" on JSON.parse).
  const moduleJson = JSON.stringify(module).replace(/</g, "\\u003c");
  const assetUrlsJson = JSON.stringify(assetUrls).replace(/</g, "\\u003c");
  const qrCodeSvgsJson = JSON.stringify(qrCodeSvgs).replace(/</g, "\\u003c");
  const startPageIdJson = JSON.stringify(startPageId).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(module.title)}</title>
<style>${playerRuntimeCss}</style>
<style>${fontFaceCss}</style>
</head>
<body>
<div id="weft-root"></div>
<script id="weft-data" type="application/json">${moduleJson}</script>
<script id="weft-asset-urls" type="application/json">${assetUrlsJson}</script>
<script id="weft-qr-codes" type="application/json">${qrCodeSvgsJson}</script>
<script id="weft-start-page" type="application/json">${startPageIdJson}</script>
<script>${playerRuntimeSource}</script>
</body>
</html>
`;
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
