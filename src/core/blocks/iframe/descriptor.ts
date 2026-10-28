import type { IframeBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * The embedded page: an address shown in a frame - or, with `qrCode`, as a code to scan first. The second block to be drawn by one function for
 * the player, the canvas, the thumbnails and the PDF (blocks/iframe/render.js), and the one that shows why the function is told where it draws: the
 * page is live in the player and on the canvas, a grey box with an icon in a thumbnail, a card with the address and the code in the PDF.
 * Its panel (IframeEditor in panels/BlockPanel.tsx) is still its own: it has a list of permissions and presets for the width.
 */
export const iframeBlock: BlockDescriptor<IframeBlock> = {
  kind: "iframe",
  version: 1,
  cliName: "Eingebettete Seite",
  schemaDefinition: "IframeBlock",
  description: "Eine eingebettete Seite (oder ein QR-Code dafür).",
  placement: { pageOnly: false, box: { x: 10, y: 40, width: 80, height: 20 } },
  fields: {
    url: { type: "text" },
    allow: { type: "text" },
    qrCode: { type: "bool" },
    presentationUrl: { type: "text" },
    forcedViewportWidth: { type: "int", min: 1 },
  },
  defaults: () => ({ kind: "iframe", url: "https://www.youtube.com/embed/", sandbox: ["allow-scripts"], qrCode: false }),
  summary: (block) => block.url,
};
