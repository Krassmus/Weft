import type { ImageBlock } from "../../types";
import type { BlockDescriptor } from "../types";
import { fileNameOf, mediaProblems } from "../media";

/**
 * The picture: a file of the module, shown on the slide - optionally cut out by a mask and given a border, a shadow, a reflection, a paper edge or a glow
 * (`mask`, `effect`: edited in the panel and on the canvas, not fields of the descriptor). How it is drawn is still its own (BlockView, SlideThumbnail,
 * the player's renderImageBlock): the mask and the effect are the picture's whole business.
 */
export const imageBlock: BlockDescriptor<ImageBlock> = {
  kind: "image",
  version: 1,
  cliName: "Bild",
  schemaDefinition: "ImageBlock",
  description: "Ein Bild: eine Datei des Moduls (`assetId`) mit Beschreibung (`alt`), optional zugeschnitten (`mask`) und mit einem Effekt (`effect`: Rahmen, Schatten, Spiegelung, Papierrand, Leuchten).",
  placement: { pageOnly: false, box: { x: 10, y: 40, width: 80, height: 20 } },
  fields: {
    assetId: { type: "asset", kind: "image" },
    alt: { type: "text" },
  },
  defaults: () => ({ kind: "image", assetId: null, alt: "" }),
  summary: (block, context) => `${block.alt ? `„${block.alt}" ` : ""}${fileNameOf(block.assetId, context?.assets) ?? "(kein Bild)"}`.trim(),
  validate: (block, module) => mediaProblems(block, module),
};
