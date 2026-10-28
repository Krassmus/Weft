import type { ProgressBlock } from "../../types";
import type { BlockDescriptor, BlockProblem } from "../types";

/**
 * The progress bar: a track with a fill as long as the value of a variable says (see ProgressBlock). Drawn by one function for the player, the canvas,
 * the thumbnails and the PDF (blocks/progress/render.js); the value it shows is the place's to find out - in the player the variable's, moved to
 * with an animation, in the editor where nothing moves the one it starts with. Its panel (ProgressEditor in panels/BlockPanel.tsx) is its own.
 */
export const progressBlock: BlockDescriptor<ProgressBlock> = {
  kind: "progress",
  version: 1,
  cliName: "Fortschrittsbalken",
  schemaDefinition: "ProgressBlock",
  description:
    "Ein Fortschrittsbalken: so lang wie der Wert einer Variable (0 bis 100) sagt; standardmäßig `progress` (wie weit die Lernperson im Modul ist). Auch auf einem Layout.",
  // A thin bar across the bottom of the slide (usually put on a layout, so that it is on every slide).
  placement: { pageOnly: false, box: { x: 10, y: 93, width: 80, height: 2.2 } },
  fields: {
    variable: { type: "text", sample: "progress" },
    color: { type: "text", sample: "#16a34a" },
    trackColor: { type: "text", sample: "#e5e7eb" },
    rounded: { type: "bool" },
    animate: { type: "bool" },
  },
  defaults: () => ({ kind: "progress", variable: "progress", color: "#3b82f6", trackColor: "#dbe4f5", rounded: true, animate: true }),
  summary: (block) => `zeigt „${block.variable}“${block.animate ? ", animiert" : ""}`,
  validate: (block, module) => {
    const problems: BlockProblem[] = [];
    const known = block.variable === "progress" || module.variables.some((v) => v.name === block.variable && (v.type === "number" || v.type === "computed"));
    if (!known)
      problems.push({
        level: "warning",
        code: "progress-variable-unknown",
        message: `Der Fortschrittsbalken zeigt „${block.variable}“, aber das ist weder „progress“ noch eine Zahlen-Variable des Moduls (er bleibt leer).`,
        hint: "variable auf „progress“ oder den Namen einer Zahlen-Variable setzen.",
      });
    return problems;
  },
};
