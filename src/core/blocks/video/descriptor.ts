import type { VideoBlock } from "../../types";
import type { BlockDescriptor } from "../types";
import { fileNameOf, mediaEvents, mediaProblems } from "../media";

/**
 * The video: a file of the module that plays on the slide. Its time marks (`stopPoints`: a point on its own timeline that pauses it and makes things
 * happen, see isMediaBlock) are not fields: they are set in a dialog (VideoStopPointDialog), which does not care how the block is described, and they
 * give the page's graph its events (pageTimeline.ts). Drawn by BlockView, SlideThumbnail and the player's renderVideoBlock.
 */
export const videoBlock: BlockDescriptor<VideoBlock> = {
  kind: "video",
  version: 1,
  cliName: "Video",
  schemaDefinition: "VideoBlock",
  description:
    "Ein Video: eine Datei des Moduls (`assetId`), die auf der Folie abgespielt wird - von selbst (`autoplay`, geht nur mit `muted`), in Schleife (`loop`) oder mit Bedienelementen (`controls`). Zeitmarken (`stopPoints`) halten es an und lösen Ereignisse aus.",
  placement: { pageOnly: false, box: { x: 10, y: 40, width: 80, height: 20 } },
  fields: {
    assetId: { type: "asset", kind: "video" },
    autoplay: { type: "bool" },
    loop: { type: "bool" },
    muted: { type: "bool" },
    controls: { type: "bool" },
  },
  events: mediaEvents,
  defaults: () => ({ kind: "video", assetId: null, autoplay: false, loop: false, muted: false, controls: true, stopPoints: [] }),
  summary: (block, context) => `${fileNameOf(block.assetId, context?.assets) ?? "(kein Video)"}${block.stopPoints.length > 0 ? `, ${block.stopPoints.length} Zeitmarken` : ""}`,
  validate: (block, module) => mediaProblems(block, module),
};
