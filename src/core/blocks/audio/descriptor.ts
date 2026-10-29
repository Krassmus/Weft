import type { AudioBlock } from "../../types";
import type { BlockDescriptor } from "../types";
import { fileNameOf, mediaProblems } from "../media";

/**
 * The sound: a file of the module that plays like a video (it starts by itself, by a trigger or by the learner; its time marks `stopPoints` have the
 * same events) but has no picture - on the slide it is invisible (`appearance` "hidden") or has the browser's player. Its time marks are set in the
 * same dialog as a video's and are not fields. Drawn by BlockView, SlideThumbnail and the player's renderAudioBlock.
 */
export const audioBlock: BlockDescriptor<AudioBlock> = {
  kind: "audio",
  version: 1,
  cliName: "Audio",
  schemaDefinition: "AudioBlock",
  description:
    "Eine Audiodatei: eine Datei des Moduls (`assetId`), die wie ein Video abgespielt wird (von selbst mit `autoplay`, in Schleife mit `loop`, durch ein Ereignis oder durch die Lernenden), aber ohne Bild - unsichtbar (`appearance` \"hidden\") oder mit Player (\"player\"). Zeitmarken (`stopPoints`) wie beim Video.",
  placement: { pageOnly: false, box: { x: 30, y: 40, width: 40, height: 12 } },
  fields: {
    assetId: { type: "asset", kind: "audio" },
    autoplay: { type: "bool" },
    loop: { type: "bool" },
    appearance: { type: "choice", options: ["hidden", "player"] },
  },
  defaults: () => ({ kind: "audio", assetId: null, autoplay: false, loop: false, appearance: "player", stopPoints: [] }),
  summary: (block, context) =>
    `${fileNameOf(block.assetId, context?.assets) ?? "(keine Audiodatei)"}, ${block.appearance === "hidden" ? "unsichtbar" : "mit Player"}${block.stopPoints.length > 0 ? `, ${block.stopPoints.length} Zeitmarken` : ""}`,
  validate: (block, module) => mediaProblems(block, module),
};
