import { defaultArrowColor } from "../../document/arrow";
import type { ArrowBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * An arrow: a curve through its waypoints (`points`, in percent of the block's own box - dragged on the canvas, not fields), plain, as if drawn by hand
 * or in the curls of Art Nouveau (`arrowStyle`), with a head at either end if wanted. One function draws it for the player, the canvas, the thumbnails
 * and the PDF (blocks/arrow/render.js), which also works out the curve the editor's handles sit on.
 */
export const arrowBlock: BlockDescriptor<ArrowBlock> = {
  kind: "arrow",
  version: 1,
  cliName: "Pfeil",
  schemaDefinition: "ArrowBlock",
  description: "Ein Pfeil: eine Kurve durch Stützpunkte (`points`, in Prozent des Blocks), schlicht, wie von Hand gezeichnet oder verziert (`arrowStyle`), mit Pfeilspitze am Anfang (`startHead`) und/oder am Ende (`endHead`), Farbe `color` und Strichstärke `width`.",
  placement: { pageOnly: false, box: { x: 20, y: 35, width: 60, height: 30 } },
  fields: {
    arrowStyle: { type: "choice", options: ["plain", "sketch", "ornate"] },
    color: { type: "text" },
    width: { type: "number", min: 0 },
    startHead: { type: "bool" },
    endHead: { type: "bool" },
  },
  defaults: () => ({
    kind: "arrow",
    points: [
      { x: 0, y: 80 },
      { x: 45, y: 25 },
      { x: 100, y: 50 },
    ],
    arrowStyle: "plain",
    color: defaultArrowColor(),
    width: 0.8,
    startHead: false,
    endHead: true,
  }),
  summary: (block) => `${block.points.length} Punkte`,
};
